import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import NetInfo from "@react-native-community/netinfo";

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
  const [messages, setMessages] = useState({});
  const [isOnline, setIsOnline] = useState(false);

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
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
    });

    return () => unsubscribe();
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

  const clearExistingRoutes = useCallback(async () => {
    setStoredRoutes({});
    await AsyncStorage.removeItem('offlineData');
  }, []);

  const handleNfcRead = useCallback(async (tag) => {
    console.log('NFC tag read:', tag);
    if (!tag.ndefMessage || !tag.ndefMessage[0]) {
      console.error('Invalid NFC tag format');
      Alert.alert('NFC Error', 'Invalid NFC tag format');
      return;
    }

    const ndefMessage = tag.ndefMessage[0];
    console.log('NDEF message:', ndefMessage);
    const payload = ndefMessage.payload;
    console.log('Payload:', payload);
    const text = String.fromCharCode.apply(null, payload).substring(3);
    console.log('Decoded text:', text);

    let data;
    try {
      data = JSON.parse(text);
      console.log('Parsed data:', data);
    } catch (error) {
      console.error('Error parsing NFC data:', error);
      Alert.alert('NFC Error', 'Failed to parse NFC data');
      return;
    }

    if (data.t === 'g') {
      try {
        const greenTagId = data.id;
        console.log('Fetching from:', `https://nfcmapsapi-2.onrender.com/api/location/${greenTagId}`);
        const response = await fetch(`https://nfcmapsapi-2.onrender.com/api/location/${greenTagId}`);
        console.log('Response status:', response.status);

        if (response.status === 404) {
          throw new Error('Green tag ID not found');
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const locationData = await response.json();
        console.log('Received location data:', locationData);

        if (!locationData.t || !locationData.id || !Array.isArray(locationData.c) || typeof locationData.r !== 'number' || !Array.isArray(locationData.p)) {
          throw new Error('Invalid data structure received from the server');
        }

        const center = locationData.c;
        const radius = locationData.r;
        const points = locationData.p;

        await clearExistingRoutes();
        await downloadOfflineRegion(center, radius);

        const newStoredRoutes = await fetchAndStoreRoutes(points);

        setMapCenter(center);
        setIsSetupComplete(true);
        setStoredRoutes(newStoredRoutes);
        await AsyncStorage.setItem('offlineData', JSON.stringify({
          center: center,
          storedRoutes: newStoredRoutes,
          isSetupComplete: true,
          messages: messages
        }));
        Alert.alert('Setup Updated', 'Map data, routes, and caution messages have been updated.');
      } catch (error) {
        console.error('Error fetching location data:', error);
        if (error.message === 'Green tag ID not found') {
          Alert.alert('Setup Error', 'The scanned green tag ID was not found in the system.');
        } else {
          Alert.alert('Setup Error', `Failed to fetch or process location data: ${error.message}`);
        }
      }
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

        // Display caution message for red tag
        const cautionMessage = messages[tagId] || 'Caution: Be aware of your surroundings.';
        Alert.alert('Caution', cautionMessage);
      } else {
        console.log('Route not found for tag ID:', tagId);
        Alert.alert('Navigation Error', 'Could not find a stored route for this location.');
      }
    } else {
      Alert.alert('Invalid Tag', 'The scanned tag is not recognized by the system.');
    }
  }, [downloadOfflineRegion, isSetupComplete, storedRoutes, clearExistingRoutes, messages]);

  const fetchAndStoreRoutes = async (points) => {
    const newStoredRoutes = {};
    const newMessages = {};
    for (const point of points) {
      try {
        console.log(`Fetching route for point ${point.i}`);
        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/walking/${point.l[0]},${point.l[1]};${point.e.l[0]},${point.e.l[1]}?geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`Route data received for point ${point.i}:`, data);
        if (!data.routes || !data.routes[0] || !data.routes[0].geometry || !data.routes[0].geometry.coordinates) {
          throw new Error('Invalid route data structure');
        }
        newStoredRoutes[point.i] = {
          route: data.routes[0].geometry.coordinates,
          exitName: point.e.n,
          exitLocation: point.e.l
        };
        console.log(`Route stored for tag ${point.i}:`, newStoredRoutes[point.i]);

        // Store caution message for each point
        if (point.caution) {
          newMessages[point.i] = point.caution;
        }
      } catch (error) {
        console.error(`Error fetching route for ${point.i}:`, error);
      }
    }
    setMessages(newMessages);
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
      Alert.alert('NFC Error', `Failed to read NFC tag: ${error.message}`);
    } finally {
      setIsScanning(false);
      NfcManager.cancelTechnologyRequest();
    }
  }, [handleNfcRead]);

  const startOnlineNavigation = useCallback(async () => {
    if (!isOnline) {
      Alert.alert('No Internet Connection', 'Please connect to the internet to use online navigation.');
      return;
    }

    if (!mapCenter) {
      Alert.alert('Error', 'Current location is not set.');
      return;
    }

    // Choose a random exit point
    const exitPoints = Object.values(storedRoutes).map(route => route.exitLocation);
    if (exitPoints.length === 0) {
      Alert.alert('Error', 'No exit points available.');
      return;
    }
    const randomExitPoint = exitPoints[Math.floor(Math.random() * exitPoints.length)];

    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/walking/${mapCenter[0]},${mapCenter[1]};${randomExitPoint[0]},${randomExitPoint[1]}?geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (!data.routes || !data.routes[0] || !data.routes[0].geometry || !data.routes[0].geometry.coordinates) {
        throw new Error('Invalid route data structure');
      }
      setRoute(data.routes[0].geometry.coordinates);
      setCurrentLocation(mapCenter);
      setExitPoint(randomExitPoint);
      setIsNavigating(true);
    } catch (error) {
      console.error('Error fetching online route:', error);
      Alert.alert('Navigation Error', 'Failed to fetch the route. Please try again.');
    }
  }, [isOnline, mapCenter, storedRoutes]);

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
                    <Text style={styles.buttonText}>{isNavigating ? 'Stop Navigation' : 'Start Offline Navigation'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.button, !isOnline && styles.disabledButton]}
                  onPress={startOnlineNavigation}
                  disabled={!isOnline || isNavigating}
                >
                  <Text style={styles.buttonText}>Start Online Navigation</Text>
                </TouchableOpacity>
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
          disabledButton: {
            backgroundColor: '#cccccc',
          },
        });

        export default TrekkingNavigationMap;