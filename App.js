import React, { useState, useEffect, useMemo } from 'react';
import { View, ActivityIndicator, PanResponder } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
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
import { getFamilyCode, setFamilyCode, getActivePerson, getPersons, getMeds, clearActivePerson, clearAllData, markAsTaken, createFamily, loginToFamily, getNotificationTargetPersonIds } from './src/utils/storage.js';
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

function SwipeableTabScreen({ routeNames, screenName, children }) {
  const navigation = useNavigation();

  const swipeResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => (
        Math.abs(gestureState.dx) > 28 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
      ),
      onMoveShouldSetPanResponderCapture: (_, gestureState) => (
        Math.abs(gestureState.dx) > 28 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
      ),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, gestureState) => {
        if (Math.abs(gestureState.dx) < 70) return;

        const currentIndex = routeNames.indexOf(screenName);
        if (currentIndex === -1) return;

        if (gestureState.dx < 0 && currentIndex < routeNames.length - 1) {
          navigation.navigate(routeNames[currentIndex + 1]);
        }

        if (gestureState.dx > 0 && currentIndex > 0) {
          navigation.navigate(routeNames[currentIndex - 1]);
        }
      },
    }),
    [navigation, routeNames, screenName]
  );

  return <View style={{ flex: 1 }} {...swipeResponder.panHandlers}>{children}</View>;
}

function MainTabs({ activePerson, onPersonChange, onFullLogout, dataRefreshKey, onNotificationTargetsChange }) {
  const routeNames = useMemo(() => (
    activePerson.canSeeAll
      ? ['Ana Ekran', 'Kişiler', 'İlaçlar', 'Alınacaklar', 'Geçmiş', 'Profilim']
      : ['Ana Ekran', 'Geçmiş', 'Profilim']
  ), [activePerson.canSeeAll]);

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
        {() => (
          <SwipeableTabScreen routeNames={routeNames} screenName="Ana Ekran">
            <DashboardScreen activePerson={activePerson} dataRefreshKey={dataRefreshKey} />
          </SwipeableTabScreen>
        )}
      </Tab.Screen>

      {activePerson.canSeeAll && (
        <>
          <Tab.Screen name="Kişiler">
            {() => (
              <SwipeableTabScreen routeNames={routeNames} screenName="Kişiler">
                <PersonsScreen activePerson={activePerson} onNotificationTargetsChange={onNotificationTargetsChange} />
              </SwipeableTabScreen>
            )}
          </Tab.Screen>
          <Tab.Screen name="İlaçlar" options={{ headerShown: false }}>
            {() => (
              <SwipeableTabScreen routeNames={routeNames} screenName="İlaçlar">
                <MedsScreen activePerson={activePerson} />
              </SwipeableTabScreen>
            )}
          </Tab.Screen>
          <Tab.Screen name="Alınacaklar">
            {() => (
              <SwipeableTabScreen routeNames={routeNames} screenName="Alınacaklar">
                <ReorderScreen />
              </SwipeableTabScreen>
            )}
          </Tab.Screen>
        </>
      )}

      <Tab.Screen name="Geçmiş">
        {() => (
          <SwipeableTabScreen routeNames={routeNames} screenName="Geçmiş">
            <LogsScreen activePerson={activePerson} dataRefreshKey={dataRefreshKey} />
          </SwipeableTabScreen>
        )}
      </Tab.Screen>

      <Tab.Screen name="Profilim" options={{ tabBarLabel: activePerson?.name || 'Profilim' }}>
        {() => (
          <SwipeableTabScreen routeNames={routeNames} screenName="Profilim">
            <ProfileScreen
              activePerson={activePerson}
              onPersonChange={onPersonChange}
              onFullLogout={onFullLogout}
            />
          </SwipeableTabScreen>
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
  const [notificationTargetsRefreshKey, setNotificationTargetsRefreshKey] = useState(0);

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
          const persons = await getPersons();
          const selectedPersonIds = await getNotificationTargetPersonIds(selectedPerson.id);
          await rebuildRemindersForPerson({
            meds,
            activePerson: selectedPerson,
            persons,
            selectedPersonIds,
          });
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

      const [meds, persons, selectedPersonIds] = await Promise.all([
        getMeds(),
        getPersons(),
        getNotificationTargetPersonIds(activePerson.id),
      ]);
      await rebuildRemindersForPerson({
        meds,
        activePerson,
        persons,
        selectedPersonIds,
      });
    };

    syncRemindersForActivePerson();
  }, [isAuthenticated, activePerson?.id, activePerson?.receivesNotifications, notificationTargetsRefreshKey]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const actionId = response?.actionIdentifier;
      const data = response?.notification?.request?.content?.data || {};
      const notificationId = response?.notification?.request?.identifier;

      const resolveTakerId = async () => {
        if (data.targetPersonId && data.targetPersonId !== 'all') return data.targetPersonId;
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
          targetPersonId: data.targetPersonId,
          targetPersonName: data.targetPersonName,
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

  const handleNotificationTargetsChange = () => {
    setNotificationTargetsRefreshKey((key) => key + 1);
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
          onNotificationTargetsChange={handleNotificationTargetsChange}
        />
      )}
    </NavigationContainer>
  );
}
