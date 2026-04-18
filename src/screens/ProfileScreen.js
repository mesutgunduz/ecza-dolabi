import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, ActivityIndicator
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMeds, getLogs, getPersons, markAsTaken, clearActivePerson, clearAllData } from '../utils/storage';
import { LogOut, Pill, Clock, CheckCircle, Shield, Users, Check } from 'lucide-react-native';

export default function ProfileScreen({ activePerson, onPersonChange, onFullLogout }) {
  const [myMeds, setMyMeds] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [familySummary, setFamilySummary] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);

  const todayStr = (() => {
    const now = new Date();
    return `${now.getDate().toString().padStart(2,'0')}.${(now.getMonth()+1).toString().padStart(2,'0')}.${now.getFullYear()}`;
  })();

  const loadData = async () => {
    try {
      if (!activePerson) return;
      setLoading(true);
      const allMeds = await getMeds();
      const allLogs = await getLogs();
      const allPersons = await getPersons();
      setPersons(allPersons);

      const meds = allMeds.filter(m => m.personId === activePerson.id && m.isActive !== false);
      const today = allLogs.filter(l => l.personId === activePerson.id && l.date === todayStr);
      const recent = allLogs
        .filter(l => l.personId === activePerson.id)
        .slice(0, 10);

      setMyMeds(meds);
      setTodayLogs(today);
      setRecentLogs(recent);

      if (activePerson.canSeeAll) {
        const summary = allPersons
          .filter(p => p.id !== activePerson.id)
          .map(p => {
            const pMeds = allMeds.filter(m => m.personId === p.id && m.isActive !== false);
            const pLogs = allLogs.filter(l => l.personId === p.id && l.date === todayStr);
            return { ...p, medCount: pMeds.length, takenToday: pLogs.length };
          });
        setFamilySummary(summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, [activePerson]));

  const getLogTakerName = (log) => {
    if (log.takerName) return log.takerName;
    const p = persons.find(x => x.id === log.personId);
    return p ? p.name : (activePerson.id === log.personId ? activePerson.name : 'Bilinmeyen');
  };

  const handleTakeMed = async (med) => {
    try {
      setLoading(true);
      const success = await markAsTaken(med.id, activePerson.id, parseFloat(med.consumePerUsage || 1), med.name, activePerson.name);
      if (success) {
        Alert.alert("Başarılı ✅", `${med.name} içildi.`);
        await loadData();
      }
    } catch (err) {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#059669" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Profil Özeti */}
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{activePerson.avatar || '🧑'}</Text></View>
        <View style={{flex:1}}>
          <Text style={styles.name}>{activePerson.name}</Text>
          <Text style={styles.role}>{activePerson.canSeeAll ? '👑 Yönetici' : '👤 Üye'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutIcon} onPress={() => onPersonChange()}>
           <Users color="#059669" size={20} />
        </TouchableOpacity>
      </View>

      {/* İlaçlarım */}
      <Text style={styles.sectionTitle}>💊 Aktif İlaçlarım</Text>
      {myMeds.map(med => (
        <View key={med.id} style={styles.miniCard}>
          <Text style={styles.medName}>{med.name}</Text>
          <TouchableOpacity style={styles.miniBtn} onPress={() => handleTakeMed(med)}>
            <Check color="#fff" size={16} />
            <Text style={styles.miniBtnText}>Kullan</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Son Hareketler */}
      <Text style={styles.sectionTitle}>🕒 Son Hareketlerim</Text>
      <View style={styles.logBox}>
        {recentLogs.map(log => (
          <View key={log.id} style={styles.logItem}>
             <Text style={styles.logTime}>{log.time}</Text>
             <View style={{flex:1}}>
                <Text style={styles.logText}>{log.medName || 'İlaç'} kullanıldı</Text>
                <Text style={styles.logTaker}>Kullanan: {getLogTakerName(log)}</Text>
             </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.fullLogout} onPress={() => onFullLogout()}>
        <LogOut color="#EF4444" size={20} />
        <Text style={styles.logoutText}>Sistemden Çıkış Yap</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 20, elevation: 2 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarText: { fontSize: 24 },
  name: { fontSize: 18, fontWeight: 'bold' },
  role: { fontSize: 12, color: '#6B7280' },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 10, marginTop: 10 },
  miniCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 8 },
  medName: { fontWeight: 'bold', color: '#111827' },
  miniBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#059669', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  miniBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  logBox: { backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  logItem: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingVertical: 8 },
  logTime: { width: 50, fontSize: 11, color: '#6B7280', fontWeight: 'bold' },
  logText: { fontSize: 13, fontWeight: '500' },
  logTaker: { fontSize: 11, color: '#9CA3AF' },
  fullLogout: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 30, padding: 15, backgroundColor: '#FEF2F2', borderRadius: 12 },
  logoutText: { color: '#EF4444', fontWeight: 'bold', marginLeft: 8 }
});
