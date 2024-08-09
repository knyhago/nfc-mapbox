import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';

const AddLocationDetails = () => {
  const [points, setPoints] = useState([{ i: '', lon: '', lat: '', exitName: '', exitLon: '', exitLat: '' }]);
  const [existingData, setExistingData] = useState(null);

  useEffect(() => {
    fetchExistingData();
  }, []);

  const fetchExistingData = async () => {
    try {
      const response = await fetch('https://nfcmapsapi-1.onrender.com/api/location');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setExistingData(data);
    } catch (error) {
      console.error('Error fetching existing data:', error);
      Alert.alert('Error', 'Failed to fetch existing location data');
    }
  };

  const addPoint = () => {
    setPoints([...points, { i: '', lon: '', lat: '', exitName: '', exitLon: '', exitLat: '' }]);
  };

  const updatePoint = (index, field, value) => {
    const newPoints = [...points];
    newPoints[index] = { ...newPoints[index], [field]: value };
    setPoints(newPoints);
  };

  const submitData = async () => {
    if (!existingData) {
      Alert.alert('Error', 'Existing data not loaded. Please try again.');
      return;
    }

    try {
      for (const point of points) {
        const formattedPoint = {
          i: point.i,
          l: [parseFloat(point.lon), parseFloat(point.lat)],
          e: {
            n: point.exitName,
            l: [parseFloat(point.exitLon), parseFloat(point.exitLat)]
          }
        };

        const response = await fetch('https://nfcmapsapi-1.onrender.com/api/location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formattedPoint),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Point submitted successfully:', result);
      }

      Alert.alert('Success', 'New points added successfully');
      setPoints([{ i: '', lon: '', lat: '', exitName: '', exitLon: '', exitLat: '' }]);
      fetchExistingData(); // Refresh the existing data after adding new points
    } catch (error) {
      console.error('Error submitting data:', error);
      Alert.alert('Error', 'Failed to submit new points');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Add New Points</Text>

      {points.map((point, index) => (
        <View key={index} style={styles.pointContainer}>
          <Text style={styles.pointTitle}>Point {index + 1}</Text>

          <Text style={styles.label}>Tag ID:</Text>
          <TextInput
            style={styles.input}
            placeholder="Tag ID"
            value={point.i}
            onChangeText={(text) => updatePoint(index, 'i', text)}
          />

          <Text style={styles.label}>Tag Location:</Text>
          <View style={styles.coordContainer}>
            <TextInput
              style={styles.input}
              placeholder="Longitude"
              value={point.lon}
              onChangeText={(text) => updatePoint(index, 'lon', text)}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Latitude"
              value={point.lat}
              onChangeText={(text) => updatePoint(index, 'lat', text)}
              keyboardType="numeric"
            />
          </View>

          <Text style={styles.label}>Exit Name:</Text>
          <TextInput
            style={styles.input}
            placeholder="Exit Name"
            value={point.exitName}
            onChangeText={(text) => updatePoint(index, 'exitName', text)}
          />

          <Text style={styles.label}>Exit Location:</Text>
          <View style={styles.coordContainer}>
            <TextInput
              style={styles.input}
              placeholder="Longitude"
              value={point.exitLon}
              onChangeText={(text) => updatePoint(index, 'exitLon', text)}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Latitude"
              value={point.exitLat}
              onChangeText={(text) => updatePoint(index, 'exitLat', text)}
              keyboardType="numeric"
            />
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.button} onPress={addPoint}>
        <Text style={styles.buttonText}>Add Another Point</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.submitButton} onPress={submitData}>
        <Text style={styles.buttonText}>Submit</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    marginBottom: 10,
    borderRadius: 5,
  },
  coordContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pointContainer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 20,
  },
  pointTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButton: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AddLocationDetails;