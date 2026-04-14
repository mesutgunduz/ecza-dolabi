import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Users, Pill, Clock } from 'lucide-react-native';

import DashboardScreen from './src/screens/DashboardScreen';
import PersonsScreen from './src/screens/PersonsScreen';
import MedsScreen from './src/screens/MedsScreen';
import LogsScreen from './src/screens/LogsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            if (route.name === 'Ana Ekran') return <Home color={color} size={size} />;
            if (route.name === 'Kişiler') return <Users color={color} size={size} />;
            if (route.name === 'İlaçlar') return <Pill color={color} size={size} />;
            if (route.name === 'Geçmiş') return <Clock color={color} size={size} />;
          },
          tabBarActiveTintColor: '#059669', // Medical green
          tabBarInactiveTintColor: 'gray',
          headerStyle: { backgroundColor: '#fff' },
          headerTitleStyle: { color: '#111827', fontWeight: 'bold' },
        })}
      >
        <Tab.Screen name="Ana Ekran" component={DashboardScreen} />
        <Tab.Screen name="Kişiler" component={PersonsScreen} />
        <Tab.Screen name="İlaçlar" component={MedsScreen} />
        <Tab.Screen name="Geçmiş" component={LogsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
