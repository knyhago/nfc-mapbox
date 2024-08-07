import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

const MAPBOX_ACCESS_TOKEN = 'sk.eyJ1Ijoia255aGFnbyIsImEiOiJjbHluM3E4MnowMjFpMnFzNGlrcDVmb2poIn0.StmL2pLmbTb47Rm7nOJ1ag';
MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

const TrekkingNavigationMap = () => {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [exitPoints, setExitPoints] = useState({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [offlinePack, setOfflinePack] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [route, setRoute] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(12);
  const [mapCenter, setMapCenter] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(false);

  const mapRef = useRef(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        await NfcManager.start();
        MapboxGL.setTelemetryEnabled(false);

        const storedData = await AsyncStorage.getItem('offlineData');
        if (storedData) {
          const data = JSON.parse(storedData);
          if (data.isSetupComplete) {
            setExitPoints(data.exitPoints);
            setMapCenter(data.center);
            if (data.route) {
              setRoute(data.route);
            }
            setIsSetupComplete(true);
          }
        }

        const packs = await MapboxGL.offlineManager.getPacks();
        if (packs.length > 0) setOfflinePack(packs);
      } catch (error) {
        console.error('Initialization Error:', error);
      }
    };

    initialize();
  }, []);

  const downloadOfflineRegion = useCallback(async (center, radius) => {
    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      const bounds = getBoundsFromCenterAndRadius(center, radius);
      const packName = `trekking_region_${Date.now()}`;
      await MapboxGL.offlineManager.createPack(
        {
          name: packName,
          styleURL: MapboxGL.StyleURL.Outdoors,
          minZoom: 10,
          maxZoom: 15,
          bounds: bounds,
        },
        (offlinePack, status) => {
          setDownloadProgress(status.percentage);
        }
      );

      setDownloadProgress(100);
      setOfflinePack(await MapboxGL.offlineManager.getPacks());
      Alert.alert('Download Complete', 'Offline region has been downloaded.');
    } catch (error) {
      console.error('Error downloading offline region:', error);
      Alert.alert('Download Error', 'Failed to download offline region.');
    } finally {
      setIsDownloading(false);
    }
  }, []);

  const getBoundsFromCenterAndRadius = (center, radiusInKm) => {
    const lat = center[1];
    const lon = center[0];
    const radiusInDegrees = radiusInKm / 111.32; // Approximate degrees per km at the equator

    const latMin = lat - radiusInDegrees;
    const latMax = lat + radiusInDegrees;
    const lonMin = lon - radiusInDegrees / Math.cos(lat * Math.PI / 180);
    const lonMax = lon + radiusInDegrees / Math.cos(lat * Math.PI / 180);

    return [[lonMin, latMin], [lonMax, latMax]];
  };

  const handleNfcRead = useCallback(async (tag) => {
    const ndefMessage = tag.ndefMessage[0];
    const payload = ndefMessage.payload;
    const text = String.fromCharCode.apply(null, payload).substring(3);
    const data = JSON.parse(text);

    if (data.t === 'g') {
      const center = data.c;
      const radius = data.r; // radius in km
      await downloadOfflineRegion(center, radius);
      const exitPointsData = data.e.reduce((acc, [lon, lat, name]) => {
        acc[name] = [lon, lat];
        return acc;
      }, {});
      setExitPoints(exitPointsData);
      setMapCenter(center);
      setIsSetupComplete(true);
      await AsyncStorage.setItem('offlineData', JSON.stringify({
        exitPoints: exitPointsData,
        center: center,
        isSetupComplete: true
      }));
      Alert.alert('Setup Complete', 'Map data and exit points set up.');
    } else if (data.t === 'r' && isSetupComplete) {
      const [lon, lat] = data.c;
      setCurrentLocation([lon, lat]);
      const nearestExit = findNearestExitPoint([lon, lat]);
      if (nearestExit) {
        const route = await fetchRoute([lon, lat], exitPoints[nearestExit]);
        setRoute(route);
        await AsyncStorage.setItem('offlineData', JSON.stringify({
          exitPoints,
          center: mapCenter,
          route,
          isSetupComplete: true
        }));
        setIsNavigating(true);
        Alert.alert('Navigation Started', `Navigating to nearest exit point: ${nearestExit}`);
      }
    }
  }, [mapCenter, exitPoints, downloadOfflineRegion, isSetupComplete]);

  const fetchRoute = async (start, end) => {
    const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`);
    const data = await response.json();
    return data.routes[0].geometry.coordinates;
  };

  const startNavigation = useCallback(() => {
    if (offlinePack && route && isSetupComplete) {
      setIsNavigating(true);
    } else {
      Alert.alert('Navigation Error', 'Ensure offline region is downloaded, setup is complete, and a route is selected.');
    }
  }, [offlinePack, route, isSetupComplete]);

  const stopNavigation = useCallback(() => setIsNavigating(false), []);

  const zoomIn = useCallback(() => setZoomLevel((prevZoom) => Math.min(prevZoom + 1, 20)), []);
  const zoomOut = useCallback(() => setZoomLevel((prevZoom) => Math.max(prevZoom - 1, 0)), []);

  const readNfcTag = useCallback(async () => {
    setIsScanning(true);
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      await handleNfcRead(tag);
    } catch (error) {
      console.warn('Error reading NFC tag:', error);
    } finally {
      setIsScanning(false);
      NfcManager.cancelTechnologyRequest();
    }
  }, [handleNfcRead]);

  const findNearestExitPoint = useCallback((location) => {
    let nearest = null;
    let shortestDistance = Infinity;
    for (const [name, exitLocation] of Object.entries(exitPoints)) {
      const distance = calculateDistance(location, exitLocation);
      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearest = name;
      }
    }
    return nearest;
  }, [exitPoints]);

  const calculateDistance = (point1, point2) => {
    const dx = point1[0] - point2[0];
    const dy = point1[1] - point2[1];
    return Math.sqrt(dx * dx + dy * dy);
  };

  return (
    <View style={styles.container}>
      <MapboxGL.MapView ref={mapRef} style={styles.map} styleURL={MapboxGL.StyleURL.Outdoors} offlineEnabled>
        <MapboxGL.Camera zoomLevel={zoomLevel} centerCoordinate={currentLocation || mapCenter || [-0.1276, 51.5074]} />
        {isSetupComplete && currentLocation && (
          <MapboxGL.PointAnnotation id="currentLocation" coordinate={currentLocation}>
            <View style={styles.currentLocationIcon} />
          </MapboxGL.PointAnnotation>
        )}
        {isSetupComplete && Object.entries(exitPoints).map(([name, location]) => (
          <MapboxGL.PointAnnotation key={name} id={`exit_${name}`} coordinate={location}>
            <View style={styles.exitPointIcon}>
              <Text style={styles.exitPointText}>{name}</Text>
            </View>
          </MapboxGL.PointAnnotation>
        ))}
        {isSetupComplete && isNavigating && route && (
          <MapboxGL.ShapeSource
            id="routeSource"
            shape={{
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: route,
                  },
                },
              ],
            }}
          >
            <MapboxGL.LineLayer id="routeLayer" style={styles.routeLine} />
          </MapboxGL.ShapeSource>
        )}
      </MapboxGL.MapView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={readNfcTag} disabled={isScanning}>
          <Text style={styles.buttonText}>Scan NFC Tag</Text>
        </TouchableOpacity>
        {isSetupComplete && (
          <TouchableOpacity
            style={styles.button}
            onPress={isNavigating ? stopNavigation : startNavigation}
            disabled={!offlinePack || !route}
          >
            <Text style={styles.buttonText}>{isNavigating ? 'Stop Navigation' : 'Start Navigation'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.zoomButtonContainer}>
        <TouchableOpacity style={styles.zoomButton} onPress={zoomIn}>
          <Text style={styles.zoomButtonText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomButton} onPress={zoomOut}>
          <Text style={styles.zoomButtonText}>-</Text>
        </TouchableOpacity>
      </View>

      {isDownloading && (
        <View style={styles.downloadProgressContainer}>
          <Text style={styles.downloadProgressText}>Downloading: {downloadProgress.toFixed(2)}%</Text>
        </View>
      )}

      {isScanning && (
        <View style={styles.scanningBox}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.scanningText}>Scanning for NFC tag...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  buttonContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    flex: 1,
    marginHorizontal: 5,
  },
  buttonText: { color: 'white', textAlign: 'center', fontWeight: 'bold' },
  zoomButtonContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
    alignItems: 'center',
  },
  zoomButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  zoomButtonText: { fontSize: 24, fontWeight: 'bold' },
  downloadProgressContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#00000080',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  downloadProgressText: { color: 'white' },
  scanningBox: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -75 }, { translateY: -50 }],
    backgroundColor: '#ffffff90',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanningText: { marginTop: 10, fontSize: 16, color: '#007AFF' },
  currentLocationIcon: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'blue',
  },
  exitPointIcon: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'red',
  },
  exitPointText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 20,
  },
  routeLine: {
    lineColor: '#ff0000',
    lineWidth: 4,
  },
});

export default TrekkingNavigationMap;