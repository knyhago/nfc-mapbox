import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import HomePage from './homePage';
import TrekkingNavigationMap from './TrekkingNavigationMap';
import AddLocationDetails from './addDetails';

const Stack = createStackNavigator();

const App = () => {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomePage} />
          <Stack.Screen name="TrekkingNavigationMap" component={TrekkingNavigationMap} />
          <Stack.Screen name="AddLocationDetails" component={AddLocationDetails} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;