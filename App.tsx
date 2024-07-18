import React, { Component } from "react";
import { StyleSheet, View, Button, TextInput, PermissionsAndroid, Platform, TouchableOpacity, Text } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import Geolocation from "react-native-geolocation-service";
import NetInfo from "@react-native-community/netinfo";
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

const MAPBOX_ACCESS_TOKEN = "sk.eyJ1Ijoia255aGFnbyIsImEiOiJjbHluM3E4MnowMjFpMnFzNGlrcDVmb2poIn0.StmL2pLmbTb47Rm7nOJ1ag";

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5FCFF"
  },
  container: {
    flex: 1,
    width: '100%',
  },
  map: {
    flex: 1
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 5,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
    maxHeight: 250,
    overflow: 'scroll',
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 10,
    paddingLeft: 10,
  },
  zoomContainer: {
    position: 'absolute',
    right: 20,
    top: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 5,
    padding: 5,
  },
  zoomButton: {
    width: 30,
    height: 30,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 5,
    borderRadius: 15,
  },
  zoomButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  homeButton: {
    marginVertical: 10,
    padding: 10,
    backgroundColor: '#007AFF',
    borderRadius: 5,
  },
  homeButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
});

class ZoomControls extends Component {
  render() {
    return (
      <View style={styles.zoomContainer}>
        <TouchableOpacity style={styles.zoomButton} onPress={this.props.onZoomIn}>
          <Text style={styles.zoomButtonText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomButton} onPress={this.props.onZoomOut}>
          <Text style={styles.zoomButtonText}>-</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

export default class App extends Component {
  state = {
    latitude: null,
    longitude: null,
    offlinePack: null,
    destination: "",
    route: null,
    zoomLevel: 15,
    isOffline: false,
    showMap: false,
  };

  async componentDidMount() {
    MapboxGL.setTelemetryEnabled(false);
    await this.requestLocationPermission();
    this.getCurrentLocation();
    this.checkNetworkConnectivity();

    this.unsubscribe = NetInfo.addEventListener(state => {
      this.setState({ isOffline: !state.isConnected });
    });

    await NfcManager.start();
  }

  componentWillUnmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    NfcManager.cancelTechnologyRequest().catch(() => 0);
  }

  requestLocationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "This app needs access to your location.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.warn("Location permission denied");
        }
      }
    } catch (err) {
      console.warn(err);
    }
  };

  getCurrentLocation = () => {
    Geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        this.setState({ latitude, longitude });
      },
      error => {
        console.warn(error.code, error.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  checkNetworkConnectivity = async () => {
    const networkState = await NetInfo.fetch();
    this.setState({ isOffline: !networkState.isConnected });
  };

  downloadOfflineMap = async () => {
    const { latitude, longitude } = this.state;
    if (latitude && longitude) {
      const bounds = [[longitude - 0.05, latitude - 0.05], [longitude + 0.05, latitude + 0.05]];

      // Generate a base name for the offline pack
      const baseName = `offline_${latitude.toFixed(4)}_${longitude.toFixed(4)}`;

      // Function to check if a pack with a given name exists
      const packExists = async (name) => {
        const packs = await MapboxGL.offlineManager.getPacks();
        return packs.some(pack => pack.name === name);
      };

      // Find an available name
      let packName = baseName;
      let counter = 1;
      while (await packExists(packName)) {
        packName = `${baseName}_${counter}`;
        counter++;
      }

      const options = {
        name: packName,
        styleURL: MapboxGL.StyleURL.Street,
        bounds,
        minZoom: 10,
        maxZoom: 16,
      };

      try {
        const offlinePack = await MapboxGL.offlineManager.createPack(options, this.onOfflinePackProgress);
        this.setState({ offlinePack });
        console.log("Offline pack download complete");
        alert(`Offline map '${packName}' downloaded successfully!`);
      } catch (error) {
        console.warn("Offline pack download error", error);
        alert("Failed to download offline map. Please try again.");
      }
    } else {
      console.warn("Current location not available");
      alert("Unable to download offline map. Please ensure location services are enabled.");
    }
  };

  onOfflinePackProgress = (offlinePack, status) => {
    console.log(status.percentage);
  };

  handleDestinationInput = (text) => {
    this.setState({ destination: text });
  }

  geocodeDestination = async () => {
    const { destination } = this.state;
    try {
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(destination)}.json?access_token=${MAPBOX_ACCESS_TOKEN}`);
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const [long, lat] = data.features[0].center;
        return { latitude: lat, longitude: long };
      }
    } catch (error) {
      console.error("Geocoding error:", error);
    }
    return null;
  }

 getDirections = async () => {
   const { latitude, longitude, isOffline } = this.state;

   if (isOffline) {
     alert("Offline mode: directions are not available. Please connect to the internet to get directions.");
     return;
   }

   const dest = await this.geocodeDestination();
   if (dest) {
     try {
       const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${longitude},${latitude};${dest.longitude},${dest.latitude}?geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`);
       const data = await response.json();
       if (data.routes && data.routes.length > 0) {
         this.setState({ route: data.routes[0].geometry });
       }
     } catch (error) {
       console.error("Routing error:", error);
       alert("Unable to fetch directions. Please check your internet connection and try again.");
     }
   }
 }

  onZoomIn = () => {
    this.setState(prevState => ({ zoomLevel: Math.min(prevState.zoomLevel + 1, 20) }));
  }

  onZoomOut = () => {
    this.setState(prevState => ({ zoomLevel: Math.max(prevState.zoomLevel - 1, 0) }));
  }

  readNfcTag = async () => {
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);

      const tag = await NfcManager.getTag();
      console.warn('Tag found', tag);

      if (tag.ndefMessage && tag.ndefMessage.length > 0) {
        const ndefRecord = tag.ndefMessage[0];
        const textDecoder = new TextDecoder('utf-8');
        const data = textDecoder.decode(ndefRecord.payload).substring(3);

        if (data.startsWith('geo:')) {
          const coordinates = data.substring(4);
          const [latitude, longitude] = coordinates.split(',').map(parseFloat);

          if (!isNaN(latitude) && !isNaN(longitude)) {
            this.setState({ latitude, longitude, showMap: true });
            console.log(`Updated coordinates: ${latitude}, ${longitude}`);
            alert("NFC tag scanned successfully. Starting position set.");
          } else {
            console.warn('Invalid coordinate format');
            alert("Invalid coordinate format in NFC tag.");
          }
        } else {
          console.warn('Not a geo tag');
          alert("The NFC tag does not contain location information.");
        }
      }
    } catch (ex) {
      console.warn('Oops!', ex);
      alert("Failed to read NFC tag. Please try again.");
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => 0);
    }
  }

  renderHomePage() {
    return (
      <View style={styles.page}>
        <TouchableOpacity style={styles.homeButton} onPress={this.downloadOfflineMap}>
          <Text style={styles.homeButtonText}>Download Current Location</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.homeButton} onPress={this.readNfcTag}>
          <Text style={styles.homeButtonText}>Scan NFC Tag</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.homeButton} onPress={() => this.setState({ showMap: true })}>
          <Text style={styles.homeButtonText}>Show Map</Text>
        </TouchableOpacity>
      </View>
    );
  }

  renderMap() {
    const { latitude, longitude, route, isOffline } = this.state;

    return (
      <View style={styles.page}>
        <View style={styles.container}>
          {latitude && longitude ? (
            <MapboxGL.MapView
              style={styles.map}
              scrollEnabled={true}
              zoomEnabled={true}
              styleURL={isOffline ? MapboxGL.StyleURL.Street : undefined}
              offlineEnabled={isOffline}
            >
              <MapboxGL.Camera
                zoomLevel={this.state.zoomLevel}
                centerCoordinate={[longitude, latitude]}
              />
              <MapboxGL.UserLocation />
              {route && !isOffline && (
                <MapboxGL.ShapeSource id="routeSource" shape={route}>
                  <MapboxGL.LineLayer id="routeLayer" style={{ lineColor: 'blue', lineWidth: 3 }} />
                </MapboxGL.ShapeSource>
              )}
            </MapboxGL.MapView>
          ) : null}
          <ZoomControls onZoomIn={this.onZoomIn} onZoomOut={this.onZoomOut} />
        </View>
        <View style={styles.buttonContainer}>
          <TextInput
            style={styles.input}
            onChangeText={this.handleDestinationInput}
            value={this.state.destination}
            placeholder="Enter destination"
          />
          <Button
            title="Get Directions"
            onPress={this.getDirections}
            disabled={isOffline}
          />
          <Button
            title={isOffline ? "Go Online" : "Go Offline"}
            onPress={() => this.setState(prevState => ({ isOffline: !prevState.isOffline }))}
          />
          <Button
            title="Back to Home"
            onPress={() => this.setState({ showMap: false })}
          />
        </View>
      </View>
    );
  }

  render() {
    return this.state.showMap ? this.renderMap() : this.renderHomePage();
  }
}