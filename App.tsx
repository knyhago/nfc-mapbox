import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

const MAPBOX_ACCESS_TOKEN = 'sk.eyJ1Ijoia255aGFnbyIsImEiOiJjbHluM3E4MnowMjFpMnFzNGlrcDVmb2poIn0.StmL2pLmbTb47Rm7nOJ1ag';
MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

const TrekkingNavigationMap = () => {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [offlinePack, setOfflinePack] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [route, setRoute] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(12);
  const [mapCenter, setMapCenter] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [storedRoutes, setStoredRoutes] = useState({});
  const [exitPoint, setExitPoint] = useState(null);

  const mapRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        await NfcManager.start();
        MapboxGL.setTelemetryEnabled(false);

        const storedData = await AsyncStorage.getItem('offlineData');
        if (storedData) {
          const data = JSON.parse(storedData);
          if (data.isSetupComplete) {
            setMapCenter(data.center);
            setStoredRoutes(data.storedRoutes || {});
            setIsSetupComplete(true);
          }
        }

        const packs = await MapboxGL.offlineManager.getPacks();
        if (packs.length > 0) setOfflinePack(packs[0]);
      } catch (error) {
        console.error('Initialization Error:', error);
      }
    };

    initialize();
  }, []);

  useEffect(() => {
    if (route) {
      setIsNavigating(true);
      if (cameraRef.current) {
        cameraRef.current.setCamera({
          centerCoordinate: route[Math.floor(route.length / 2)],
          zoomLevel: 12,
          animationDuration: 2000,
        });
      }
    }
  }, [route]);

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
    const radiusInDegrees = radiusInKm / 111.32;

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
    console.log('NFC Tag Data:', data);

    if (data.t === 'g') {
      const center = data.c;
      const radius = data.r;
      await downloadOfflineRegion(center, radius);

      const newStoredRoutes = await fetchAndStoreRoutes(data.p);

      setMapCenter(center);
      setIsSetupComplete(true);
      await AsyncStorage.setItem('offlineData', JSON.stringify({
        center: center,
        storedRoutes: newStoredRoutes,
        isSetupComplete: true
      }));
      Alert.alert('Setup Complete', 'Map data and routes set up.');
    } else if (data.t === 'r' && isSetupComplete) {
      const tagId = data.id;
      console.log('Scanned tag ID:', tagId);
      console.log('Stored routes:', storedRoutes);
      if (storedRoutes[tagId]) {
        console.log('Found route:', storedRoutes[tagId]);
        setCurrentLocation(storedRoutes[tagId].route[0]);
        setRoute(storedRoutes[tagId].route);
        setExitPoint(storedRoutes[tagId].exitLocation);
        console.log('Route set:', storedRoutes[tagId].route);
        setIsNavigating(true);
        Alert.alert('Navigation Started', `Navigating to exit point: ${storedRoutes[tagId].exitName}`);
      } else {
        console.log('Route not found for tag ID:', tagId);
        Alert.alert('Navigation Error', 'Could not find a stored route for this location.');
      }
    }
  }, [downloadOfflineRegion, isSetupComplete, storedRoutes]);

  const fetchAndStoreRoutes = async (points) => {
    const newStoredRoutes = {};
    for (const point of points) {
      try {
        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/walking/${point.l[0]},${point.l[1]};${point.e.l[0]},${point.e.l[1]}?geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`
        );
        const data = await response.json();
        newStoredRoutes[point.i] = {
          route: data.routes[0].geometry.coordinates,
          exitName: point.e.n,
          exitLocation: point.e.l
        };
        console.log(`Route stored for tag ${point.i}:`, newStoredRoutes[point.i]);
      } catch (error) {
        console.error(`Error fetching route for ${point.i}:`, error);
      }
    }
    setStoredRoutes(newStoredRoutes);
    console.log('All stored routes:', newStoredRoutes);
    return newStoredRoutes;
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

  return (
    <View style={styles.container}>
      <MapboxGL.MapView ref={mapRef} style={styles.map} styleURL={MapboxGL.StyleURL.Outdoors} offlineEnabled>
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={zoomLevel}
          centerCoordinate={currentLocation || mapCenter || [-0.1276, 51.5074]}
        />
        {isSetupComplete && currentLocation && (
          <MapboxGL.PointAnnotation id="currentLocation" coordinate={currentLocation}>
            <View style={styles.currentLocationIcon} />
          </MapboxGL.PointAnnotation>
        )}
        {isSetupComplete && exitPoint && (
          <MapboxGL.PointAnnotation id="exitPoint" coordinate={exitPoint}>
            <View style={styles.exitPointIcon} />
          </MapboxGL.PointAnnotation>
        )}
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
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'blue',
    borderColor: 'white',
    borderWidth: 2,
  },
  exitPointIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'green',
    borderColor: 'white',
    borderWidth: 2,
  },
  routeLine: {
    lineColor: '#ff0000',
    lineWidth: 4,
  },
});

export default TrekkingNavigationMap;