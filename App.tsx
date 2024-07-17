import React, { Component } from "react";
import { StyleSheet, View, Button, TextInput, PermissionsAndroid, Platform, TouchableOpacity, Text } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import Geolocation from "react-native-geolocation-service";

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
  };

  async componentDidMount() {
    MapboxGL.setTelemetryEnabled(false);
    await this.requestLocationPermission();
    this.getCurrentLocation();
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

  downloadOfflineMap = async () => {
    const { latitude, longitude } = this.state;
    if (latitude && longitude) {
      const bounds = [[longitude - 0.05, latitude - 0.05], [longitude + 0.05, latitude + 0.05]];
      const options = {
        name: 'offlinePack',
        styleURL: MapboxGL.StyleURL.Street,
        bounds,
        minZoom: 10,
        maxZoom: 16,
      };

      MapboxGL.offlineManager.createPack(options, this.onOfflinePackProgress, this.onOfflinePackError);
    } else {
      console.warn("Current location not available");
    }
  };

  onOfflinePackProgress = (offlinePack, status) => {
    if (status.percentage === 100) {
      console.log("Offline pack download complete");
      this.setState({ offlinePack });
    }
  };

  onOfflinePackError = (offlinePack, error) => {
    console.warn("Offline pack download error", error);
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
    const { latitude, longitude } = this.state;
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
      }
    }
  }

  onZoomIn = () => {
    this.setState(prevState => ({ zoomLevel: Math.min(prevState.zoomLevel + 1, 20) }));
  }

  onZoomOut = () => {
    this.setState(prevState => ({ zoomLevel: Math.max(prevState.zoomLevel - 1, 0) }));
  }

  render() {
    const { latitude, longitude, route } = this.state;

    return (
      <View style={styles.page}>
        <View style={styles.container}>
          {latitude && longitude ? (
            <MapboxGL.MapView
              style={styles.map}
              scrollEnabled={true}
              zoomEnabled={true}
            >
              <MapboxGL.Camera
                zoomLevel={this.state.zoomLevel}
                centerCoordinate={[longitude, latitude]}
              />
              <MapboxGL.UserLocation />
              {route && (
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
          />
          <Button
            title="Download Offline Map"
            onPress={this.downloadOfflineMap}
          />
        </View>
      </View>
    );
  }
}