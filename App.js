import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Users, Pill, Clock, UserCircle } from 'lucide-react-native';

import DashboardScreen from './src/screens/DashboardScreen';
import PersonsScreen from './src/screens/PersonsScreen';
import MedsScreen from './src/screens/MedsScreen';
import LogsScreen from './src/screens/LogsScreen';
import LoginScreen from './src/screens/LoginScreen';
import PersonSelectScreen from './src/screens/PersonSelectScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { getFamilyCode, setFamilyCode, getActivePerson, getPersons, clearActivePerson, clearAllData } from './src/utils/storage.js';
import { requestNotificationPermissions } from './src/utils/notifications';

const Tab = createBottomTabNavigator();

function MainTabs({ activePerson, onPersonChange, onFullLogout }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'Ana Ekran') return <Home color={color} size={size} />;
          if (route.name === 'Kişiler') return <Users color={color} size={size} />;
          if (route.name === 'İlaçlar') return <Pill color={color} size={size} />;
          if (route.name === 'Geçmiş') return <Clock color={color} size={size} />;
          if (route.name === 'Profilim') return <UserCircle color={color} size={size} />;
          return null;
        },
        tabBarActiveTintColor: '#059669',
        tabBarInactiveTintColor: 'gray',
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { color: '#111827', fontWeight: 'bold' },
      })}
    >
      <Tab.Screen name="Ana Ekran">
        {() => <DashboardScreen activePerson={activePerson} />}
      </Tab.Screen>

      {activePerson.canSeeAll && (
        <>
          <Tab.Screen name="Kişiler" component={PersonsScreen} />
          <Tab.Screen name="İlaçlar" options={{ headerShown: false }}>
            {() => <MedsScreen activePerson={activePerson} />}
          </Tab.Screen>
        </>
      )}

      <Tab.Screen name="Geçmiş">
        {() => <LogsScreen activePerson={activePerson} />}
      </Tab.Screen>

      <Tab.Screen name="Profilim" options={{ tabBarLabel: activePerson?.name || 'Profilim' }}>
        {() => (
          <ProfileScreen
            activePerson={activePerson}
            onPersonChange={onPersonChange}
            onFullLogout={onFullLogout}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activePerson, setActivePerson] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const code = await getFamilyCode();
      if (code) {
        setIsAuthenticated(true);
        const savedPersonId = await getActivePerson();
        if (savedPersonId) {
          const persons = await getPersons();
          const found = persons.find(p => p.id === savedPersonId);
          if (found) setActivePerson(found);
        }
      }

      await requestNotificationPermissions();
      setLoading(false);
    };

    checkAuth();
  }, []);

  const handleLogin = async (code) => {
    await setFamilyCode(code);
    setIsAuthenticated(true);
  };

  const handlePersonSelected = (person) => {
    setActivePerson(person);
  };

  const handlePersonChange = async () => {
    await clearActivePerson();
    setActivePerson(null);
  };

  const handleFullLogout = async () => {
    await clearAllData();
    setIsAuthenticated(false);
    setActivePerson(null);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!isAuthenticated ? (
        <LoginScreen onLogin={handleLogin} />
      ) : !activePerson ? (
        <PersonSelectScreen onPersonSelected={handlePersonSelected} />
      ) : (
        <MainTabs
          activePerson={activePerson}
          onPersonChange={handlePersonChange}
          onFullLogout={handleFullLogout}
        />
      )}
    </NavigationContainer>
  );
}
