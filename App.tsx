import React, { Component } from "react";
import { StyleSheet, View, Button, PermissionsAndroid, Platform } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import Geolocation from "react-native-geolocation-service";

MapboxGL.setAccessToken("sk.eyJ1Ijoia255aGFnbyIsImEiOiJjbHluM3E4MnowMjFpMnFzNGlrcDVmb2poIn0.StmL2pLmbTb47Rm7nOJ1ag");

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
});

export default class App extends Component {
  state = {
    latitude: null,
    longitude: null,
    offlinePack: null,
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

  render() {
    const { latitude, longitude } = this.state;

    return (
      <View style={styles.page}>
        <View style={styles.container}>
          {latitude && longitude ? (
            <MapboxGL.MapView style={styles.map}>
              <MapboxGL.Camera
                zoomLevel={15}
                centerCoordinate={[longitude, latitude]}
              />
              <MapboxGL.UserLocation />
            </MapboxGL.MapView>
          ) : null}
        </View>
        <View style={styles.buttonContainer}>
          <Button
            title="Download Offline Map"
            onPress={this.downloadOfflineMap}
          />
        </View>
      </View>
    );
  }
}
