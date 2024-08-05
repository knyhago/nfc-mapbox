import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Text, Alert, TouchableOpacity } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

const MAPBOX_ACCESS_TOKEN = 'sk.eyJ1Ijoia255aGFnbyIsImEiOiJjbHluM3E4MnowMjFpMnFzNGlrcDVmb2poIn0.StmL2pLmbTb47Rm7nOJ1ag';
MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

const OfflineNavigationMap = () => {
  const [startCoordinate, setStartCoordinate] = useState([-0.1276, 51.5074]); // London City Center
  const [destinations, setDestinations] = useState({
    'Exit 1': [-0.0753, 51.5055],
    'Exit 2': [-0.1419, 51.5014],
    'Exit 3': [-0.1269, 51.5194]
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [offlinePack, setOfflinePack] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [route, setRoute] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(12);
  const [selectedDestination, setSelectedDestination] = useState('Exit 1');
  const [nfcEnabled, setNfcEnabled] = useState(false);

  const mapRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        await NfcManager.start();
        MapboxGL.setTelemetryEnabled(false);
        await loadOfflineData();
      } catch (error) {
        console.error('Initialization Error:', error);
      }
    })();
  }, []);

  useEffect(() => {
    loadOfflineData();
  }, [selectedDestination]);

  const loadOfflineData = async () => {
    try {
      const storedRoutes = await AsyncStorage.getItem('offlineRoutes');
      if (storedRoutes) {
        const routes = JSON.parse(storedRoutes);
        if (routes[selectedDestination]) {
          setRoute(routes[selectedDestination]);
        }
      }
      const packs = await MapboxGL.offlineManager.getPacks();
      if (packs.length > 0) {
        setOfflinePack(packs);
      }
    } catch (error) {
      console.error('Error loading offline data:', error);
    }
  };

  const downloadOfflineRegionsAndRoutes = async () => {
    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      const downloadedRoutes = {};
      const totalDestinations = Object.keys(destinations).length;
      let progressIncrement = 100 / (totalDestinations * 2);

      for (const destination of Object.keys(destinations)) {
        const endCoordinate = destinations[destination];

        // Define the bounding box that includes start and end points
        const bounds = [
          [Math.min(startCoordinate[0], endCoordinate[0]), Math.min(startCoordinate[1], endCoordinate[1])],
          [Math.max(startCoordinate[0], endCoordinate[0]), Math.max(startCoordinate[1], endCoordinate[1])]
        ];

        // Add some padding to the bounding box
        const padding = 0.01; // Approximately 1km
        bounds[0][0] -= padding;
        bounds[0][1] -= padding;
        bounds[1][0] += padding;
        bounds[1][1] += padding;

        const packName = `offline_region_${destination}_${Date.now()}`;

        // Download offline region
        await MapboxGL.offlineManager.createPack({
          name: packName,
          styleURL: MapboxGL.StyleURL.Street,
          minZoom: 10,
          maxZoom: 15,
          bounds: bounds,
        }, (offlinePack, status) => {
          setDownloadProgress(prevProgress => prevProgress + progressIncrement * (status.percentage / 100));
        });

        // Fetch and store route
        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/walking/${startCoordinate.join(',')};${endCoordinate.join(',')
          }?geometries=geojson&steps=true&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`
        );
        const json = await response.json();
        if (json.routes && json.routes.length > 0) {
          downloadedRoutes[destination] = json.routes[0].geometry.coordinates;
        } else {
          throw new Error(`No route found for ${destination}`);
        }
        setDownloadProgress(prevProgress => prevProgress + progressIncrement);
      }

      // Store all routes in AsyncStorage
      await AsyncStorage.setItem('offlineRoutes', JSON.stringify(downloadedRoutes));

      setDownloadProgress(100);
      setIsDownloading(false);
      setOfflinePack(await MapboxGL.offlineManager.getPacks());
      Alert.alert('Download Complete', 'Offline regions and routes have been downloaded.');
    } catch (error) {
      console.error('Error downloading offline data:', error);
      setIsDownloading(false);
      Alert.alert('Download Error', 'Failed to download offline regions and routes.');
    }
  };

  const startNavigation = () => {
    if (offlinePack && route) {
      setIsNavigating(true);
    } else {
      Alert.alert('Navigation Error', 'Please download the offline region and route first.');
    }
  };

  const stopNavigation = () => {
    setIsNavigating(false);
  };

  const zoomIn = () => {
    setZoomLevel(prevZoom => Math.min(prevZoom + 1, 20));
  };

  const zoomOut = () => {
    setZoomLevel(prevZoom => Math.max(prevZoom - 1, 0));
  };

  const readNfcTag = async () => {
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      const ndefMessage = tag.ndefMessage[0];
      const payload = ndefMessage.payload;

      const text = String.fromCharCode.apply(null, payload).substring(3);
      const data = JSON.parse(text);

      setStartCoordinate(data.START_COORDINATE);
      setDestinations(data.DESTINATIONS);

      setNfcEnabled(true);
      await downloadOfflineRegionsAndRoutes();
      await loadOfflineData();
    } catch (error) {
      console.warn('Error reading NFC tag:', error);
    } finally {
      NfcManager.cancelTechnologyRequest();
    }
  };

  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL={MapboxGL.StyleURL.Street}
        offlineEnabled={true}
      >
        {startCoordinate && (
          <>
            <MapboxGL.Camera
              zoomLevel={zoomLevel}
              centerCoordinate={startCoordinate}
            />
            <MapboxGL.PointAnnotation
              id="startPoint"
              coordinate={startCoordinate}
              title="Start"
            />
          </>
        )}
        {selectedDestination && destinations[selectedDestination] && (
          <MapboxGL.PointAnnotation
            id="endPoint"
            coordinate={destinations[selectedDestination]}
            title="End"
          />
        )}
        {isNavigating && route && (
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
            <MapboxGL.LineLayer
              id="routeLayer"
              style={{
                lineColor: 'red',
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}
      </MapboxGL.MapView>

      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedDestination}
          style={styles.picker}
          onValueChange={(itemValue) => setSelectedDestination(itemValue)}
        >
          {Object.keys(destinations).map((destination) => (
            <Picker.Item key={destination} label={destination} value={destination} />
          ))}
        </Picker>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.button}
          onPress={downloadOfflineRegionsAndRoutes}
          disabled={isDownloading}
        >
          <Text style={styles.buttonText}>
            {isDownloading ? `Downloading: ${downloadProgress.toFixed(2)}%` : "Download Offline Data"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={isNavigating ? stopNavigation : startNavigation}
          disabled={!offlinePack || !route}
        >
          <Text style={styles.buttonText}>
            {isNavigating ? "Stop Navigation" : "Start Navigation"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={readNfcTag}
        >
          <Text style={styles.buttonText}>
            {nfcEnabled ? "NFC Enabled" : "Read NFC Tag"}
          </Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  zoomButtonContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
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
  zoomButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  pickerContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 8,
  },
  picker: {
    height: 50,
    width: '100%',
  },
});

export default OfflineNavigationMap;
