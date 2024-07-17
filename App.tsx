import React, { Component } from "react";
import { StyleSheet, View } from "react-native";
import Mapbox, {MapView} from "@rnmapbox/maps";

Mapbox.setAccessToken("sk.eyJ1Ijoia255aGFnbyIsImEiOiJjbHluM3E4MnowMjFpMnFzNGlrcDVmb2poIn0.StmL2pLmbTb47Rm7nOJ1ag");

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "red"
  },
  container: {
    height: 300,
    width: 300,
    backgroundColor: "yellow"
  },
  map: {
    flex: 1
  }
});

export default class App extends Component {
  componentDidMount() {
    Mapbox.setTelemetryEnabled(false);
  }

  render() {
    return (
      <View style={styles.page}>
        <View style={styles.container}>
          <MapView style={styles.map} />
        </View>
      </View>
    );
  }
}