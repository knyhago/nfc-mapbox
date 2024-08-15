import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AddLocationDetails = () => {
  const [newPoint, setNewPoint] = useState({ i: '', lon: '', lat: '', exitName: '', exitLon: '', exitLat: '', caution: '' });
  const [existingData, setExistingData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [greenTagId, setGreenTagId] = useState('');
  const [newGreenTag, setNewGreenTag] = useState({ id: '', lon: '', lat: '', radius: '' });
  const [allGreenTags, setAllGreenTags] = useState([]);

  useEffect(() => {
    loadGreenTags();
  }, []);

  useEffect(() => {
    if (greenTagId) {
      fetchExistingData();
    }
  }, [greenTagId]);

  const loadGreenTags = async () => {
    try {
      const storedTags = await AsyncStorage.getItem('greenTags');
      if (storedTags !== null) {
        setAllGreenTags(JSON.parse(storedTags));
      }
    } catch (error) {
      console.error('Error loading green tags:', error);
      Alert.alert('Error', 'Failed to load green tags from storage');
    }
  };

  const saveGreenTags = async (tags) => {
    try {
      await AsyncStorage.setItem('greenTags', JSON.stringify(tags));
    } catch (error) {
      console.error('Error saving green tags:', error);
      Alert.alert('Error', 'Failed to save green tags to storage');
    }
  };

  const fetchExistingData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`https://nfcmapsapi-2.onrender.com/api/location/${greenTagId}`);
      if (!response.ok) {
        if (response.status === 404) {
          setExistingData(null);
          throw new Error('No existing data found for this green tag ID.');
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } else {
        const data = await response.json();
        setExistingData(data);
      }
    } catch (error) {
      console.error('Error fetching existing data:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateNewPoint = (field, value) => {
    setNewPoint({ ...newPoint, [field]: value });
  };

  const updateNewGreenTag = (field, value) => {
    setNewGreenTag({ ...newGreenTag, [field]: value });
  };

  const validateInputs = (data) => {
    for (let key in data) {
      if (data[key] === '') {
        throw new Error(`${key} cannot be empty`);
      }
      if (['lon', 'lat', 'exitLon', 'exitLat', 'radius'].includes(key)) {
        if (isNaN(parseFloat(data[key]))) {
          throw new Error(`${key} must be a valid number`);
        }
      }
    }
  };

  const submitNewPoint = async () => {
    if (isLoading) {
      Alert.alert('Please Wait', 'Still loading existing data. Please try again in a moment.');
      return;
    }

    try {
      validateInputs(newPoint);

      const formattedNewPoint = {
        i: newPoint.i,
        l: [parseFloat(newPoint.lon), parseFloat(newPoint.lat)],
        e: {
          n: newPoint.exitName,
          l: [parseFloat(newPoint.exitLon), parseFloat(newPoint.exitLat)]
        },
        caution: newPoint.caution
      };

      const response = await fetch(`https://nfcmapsapi-2.onrender.com/api/location/${greenTagId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formattedNewPoint),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }

      const result = await response.json();
      console.log('Data submitted successfully:', result);

      Alert.alert('Success', 'New point added successfully');
      setNewPoint({ i: '', lon: '', lat: '', exitName: '', exitLon: '', exitLat: '', caution: '' });
      fetchExistingData();
    } catch (error) {
      console.error('Error submitting data:', error);
      Alert.alert('Error', `Failed to submit data: ${error.message}`);
    }
  };

  const createNewGreenTag = async () => {
    try {
      validateInputs(newGreenTag);

      const newLocation = {
        t: "g",
        id: newGreenTag.id,
        c: [parseFloat(newGreenTag.lon), parseFloat(newGreenTag.lat)],
        r: parseFloat(newGreenTag.radius),
        p: []
      };

      console.log('Creating new green tag location:', newLocation);

      const response = await fetch('https://nfcmapsapi-2.onrender.com/api/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newLocation),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }

      const result = await response.json();
      console.log('New green tag location created successfully:', result);

      // Update local state and storage
      const updatedTags = [...allGreenTags, newLocation];
      setAllGreenTags(updatedTags);
      await saveGreenTags(updatedTags);

      Alert.alert('Success', 'New green tag location created successfully');
      setNewGreenTag({ id: '', lon: '', lat: '', radius: '' });
      setGreenTagId(newGreenTag.id);
    } catch (error) {
      console.error('Error creating new green tag:', error);
      Alert.alert('Error', `Failed to create new green tag: ${error.message}`);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Location Management</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create New Green Tag Location</Text>
        <TextInput
          style={styles.input}
          placeholder="New Green Tag ID"
          value={newGreenTag.id}
          onChangeText={(text) => updateNewGreenTag('id', text)}
        />
        <TextInput
          style={styles.input}
          placeholder="Longitude"
          value={newGreenTag.lon}
          onChangeText={(text) => updateNewGreenTag('lon', text)}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Latitude"
          value={newGreenTag.lat}
          onChangeText={(text) => updateNewGreenTag('lat', text)}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Radius"
          value={newGreenTag.radius}
          onChangeText={(text) => updateNewGreenTag('radius', text)}
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.button} onPress={createNewGreenTag}>
          <Text style={styles.buttonText}>Create New Green Tag Location</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Existing Green Tag Locations</Text>
        {allGreenTags.map((tag, index) => (
          <Text key={index} style={styles.tagItem}>{tag.id}: {tag.c[0]}, {tag.c[1]} (r: {tag.r})</Text>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add New Point to Existing Location</Text>
        <TextInput
          style={styles.input}
          placeholder="Existing Green Tag ID"
          value={greenTagId}
          onChangeText={setGreenTagId}
        />

        {isLoading ? (
          <Text style={styles.loadingText}>Loading existing data...</Text>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Error: {error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchExistingData}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {existingData ? (
              <View>
                <Text style={styles.dataInfo}>Existing data loaded. You can add a new point.</Text>
                <Text style={styles.dataInfo}>Current number of points: {existingData.p.length}</Text>
              </View>
            ) : (
              <Text style={styles.dataInfo}>No existing data. Enter a valid Green Tag ID.</Text>
            )}

            <View style={styles.pointContainer}>
              <Text style={styles.pointTitle}>New Point</Text>

              <TextInput
                style={styles.input}
                placeholder="Tag ID (e.g., r4)"
                value={newPoint.i}
                onChangeText={(text) => updateNewPoint('i', text)}
              />

              <View style={styles.coordContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Longitude"
                  value={newPoint.lon}
                  onChangeText={(text) => updateNewPoint('lon', text)}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Latitude"
                  value={newPoint.lat}
                  onChangeText={(text) => updateNewPoint('lat', text)}
                  keyboardType="numeric"
                />
              </View>

              <TextInput
                style={styles.input}
                placeholder="Exit Name"
                value={newPoint.exitName}
                onChangeText={(text) => updateNewPoint('exitName', text)}
              />

              <View style={styles.coordContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Exit Longitude"
                  value={newPoint.exitLon}
                  onChangeText={(text) => updateNewPoint('exitLon', text)}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Exit Latitude"
                  value={newPoint.exitLat}
                  onChangeText={(text) => updateNewPoint('exitLat', text)}
                  keyboardType="numeric"
                />
              </View>

              <TextInput
                style={styles.input}
                placeholder="Caution"
                value={newPoint.caution}
                onChangeText={(text) => updateNewPoint('caution', text)}
              />
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={submitNewPoint}>
              <Text style={styles.buttonText}>Submit New Point</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
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
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
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
    marginTop: 10,
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
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  errorContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
  },
  dataInfo: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  tagItem: {
    fontSize: 14,
    marginBottom: 5,
  },
});

export default AddLocationDetails;