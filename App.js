import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Users, Pill, Clock, UserCircle, ShoppingCart } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import DashboardScreen from './src/screens/DashboardScreen';
import PersonsScreen from './src/screens/PersonsScreen';
import MedsScreen from './src/screens/MedsScreen';
import LogsScreen from './src/screens/LogsScreen';
import LoginScreen from './src/screens/LoginScreen';
import PersonSelectScreen from './src/screens/PersonSelectScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ReorderScreen from './src/screens/ReorderScreen';
import { getFamilyCode, setFamilyCode, getActivePerson, getPersons, getMeds, clearActivePerson, clearAllData, markAsTaken, createFamily, loginToFamily } from './src/utils/storage.js';
import {
  requestNotificationPermissions,
  configureNotificationCategories,
  rebuildRemindersForPerson,
  scheduleReminderSnooze,
  SNOOZE_10_ACTION_ID,
  SNOOZE_30_ACTION_ID,
  TAKE_MED_ACTION_ID,
  CLOSE_ACTION_ID,
} from './src/utils/notifications';

const Tab = createBottomTabNavigator();

function MainTabs({ activePerson, onPersonChange, onFullLogout, dataRefreshKey }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'Ana Ekran') return <Home color={color} size={size} />;
          if (route.name === 'Kişiler') return <Users color={color} size={size} />;
          if (route.name === 'İlaçlar') return <Pill color={color} size={size} />;
          if (route.name === 'Alınacaklar') return <ShoppingCart color={color} size={size} />;
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
        {() => <DashboardScreen activePerson={activePerson} dataRefreshKey={dataRefreshKey} />}
      </Tab.Screen>

      {activePerson.canSeeAll && (
        <>
          <Tab.Screen name="Kişiler" component={PersonsScreen} />
          <Tab.Screen name="İlaçlar" options={{ headerShown: false }}>
            {() => <MedsScreen activePerson={activePerson} />}
          </Tab.Screen>
          <Tab.Screen name="Alınacaklar">
            {() => <ReorderScreen />}
          </Tab.Screen>
        </>
      )}

      <Tab.Screen name="Geçmiş">
        {() => <LogsScreen activePerson={activePerson} dataRefreshKey={dataRefreshKey} />}
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
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  useEffect(() => {
    const checkAuth = async () => {
      const code = await getFamilyCode();
      let selectedPerson = null;
      if (code) {
        setIsAuthenticated(true);
        const savedPersonId = await getActivePerson();
        if (savedPersonId) {
          const persons = await getPersons();
          const found = persons.find(p => p.id === savedPersonId);
          if (found) {
            selectedPerson = found;
            setActivePerson(found);
          }
        }
      }

      await configureNotificationCategories();
      const hasPerm = await requestNotificationPermissions();

      // Build reminders only for the selected profile on this device.
      if (hasPerm) {
        const meds = await getMeds();
        if (selectedPerson?.id) {
          await rebuildRemindersForPerson({ meds, activePerson: selectedPerson });
        }
      }

      if (Constants?.appOwnership === 'expo') {
        console.warn('Expo Go uses limited notifications support. Use development build for action buttons.');
      }

      setLoading(false);
    };

    checkAuth();
  }, []);

  useEffect(() => {
    const syncRemindersForActivePerson = async () => {
      if (!isAuthenticated || !activePerson?.id) return;

      const hasPerm = await requestNotificationPermissions();
      if (!hasPerm) return;

      const meds = await getMeds();
      await rebuildRemindersForPerson({ meds, activePerson });
    };

    syncRemindersForActivePerson();
  }, [isAuthenticated, activePerson?.id, activePerson?.receivesNotifications]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const actionId = response?.actionIdentifier;
      const data = response?.notification?.request?.content?.data || {};
      const notificationId = response?.notification?.request?.identifier;

      const resolveTakerId = async () => {
        if (data.personId && data.personId !== 'all') return data.personId;
        if (activePerson?.id) return activePerson.id;

        const savedPersonId = await getActivePerson();
        if (savedPersonId) return savedPersonId;

        const persons = await getPersons();
        return persons?.[0]?.id || null;
      };

      if (actionId === SNOOZE_10_ACTION_ID || actionId === SNOOZE_30_ACTION_ID) {
        const snoozeMinutes = actionId === SNOOZE_10_ACTION_ID ? 10 : 30;

        await scheduleReminderSnooze({
          medId: data.medId,
          medName: data.medName,
          minutes: snoozeMinutes,
        });

        if (notificationId) {
          await Notifications.dismissNotificationAsync(notificationId);
        }

        setDataRefreshKey((k) => k + 1);
      } else if (actionId === TAKE_MED_ACTION_ID) {
        // Mark med as taken from notification
        const takerId = await resolveTakerId();
        if (takerId) {
          let consumeAmt = Number(data.consumeAmt || 0);
          if (!Number.isFinite(consumeAmt) || consumeAmt <= 0) {
            const meds = await getMeds();
            const med = meds.find((m) => m.id === data.medId);
            consumeAmt = Number(med?.consumePerUsage || 1);
          }

          await markAsTaken(data.medId, takerId, consumeAmt, data.medName, null);

          if (notificationId) {
            await Notifications.dismissNotificationAsync(notificationId);
          }

          setDataRefreshKey((k) => k + 1);
        }
      } else if (actionId === CLOSE_ACTION_ID) {
        if (notificationId) {
          await Notifications.dismissNotificationAsync(notificationId);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [activePerson]);

  const handleAuth = async ({ mode, code, password, adminPin }) => {
    const op = mode === 'create'
      ? await createFamily(code, password)
      : await loginToFamily(code, password, adminPin);

    if (!op?.ok) return op;

    await setFamilyCode(code);
    setIsAuthenticated(true);
    return { ok: true };
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
        <LoginScreen onAuth={handleAuth} />
      ) : !activePerson ? (
        <PersonSelectScreen onPersonSelected={handlePersonSelected} />
      ) : (
        <MainTabs
          activePerson={activePerson}
          onPersonChange={handlePersonChange}
          onFullLogout={handleFullLogout}
          dataRefreshKey={dataRefreshKey}
        />
      )}
    </NavigationContainer>
  );
}
