import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, Linking
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getLogs, getMeds, getPersons, deleteLog } from '../utils/storage';
import { Clock, User, Trash2, Pill, Share2 } from 'lucide-react-native';

export default function LogsScreen({ activePerson }) {
  const [logs, setLogs] = useState([]);
  const [persons, setPersons] = useState([]);
  const [, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const l = await getLogs();
      const p = await getPersons();
      const m = await getMeds();

      let filtered = l;
      if (activePerson && !activePerson.canSeeAll) {
        filtered = l.filter(log => log.personId === activePerson.id);
      }

      setLogs(filtered);
      setPersons(p);
      setMeds(m);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, [activePerson]));

  const getPersonDisplayName = (log) => {
    if (log.takerName) return log.takerName;

    const p = persons.find(x => x.id === log.personId);
    if (p) return p.name;

    if (log.personId === 'all' || !log.personId) return 'Ortak';

    return `Silinmiş Kullanıcı (ID: ${log.personId ? log.personId.substring(0, 6) : '?'})`;
  };

  const handleDelete = (id) => {
    Alert.alert('Kaydı Sil', 'Bu geçmiş kaydını silmek istiyor musunuz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await deleteLog(id);
          loadData();
        }
      }
    ]);
  };

  const handleShare = async (log) => {
    const personName = getPersonDisplayName(log);
    const message = `💊 ${personName}, ${log.medName || 'İlaç'} ilacından ${log.dosage || 1} birim kullandı.\n📅 Tarih: ${log.date}\n⏰ Saat: ${log.time}`;
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;

    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Hata', 'WhatsApp uygulaması bulunamadı veya açılamıyor. Yüklü olduğundan emin olun.');
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#059669" /></View>;

  return (
    <View style={styles.container}>
      <FlatList
        data={logs}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Clock color="#059669" size={20} />
            </View>
            <View style={styles.content}>
              <Text style={styles.medName}>{item.medName || 'İlaç'}</Text>
              <Text style={styles.dateText}>{item.date} - {item.time}</Text>
              <View style={styles.tagRow}>
                <View style={styles.tag}>
                  <User color="#4B5563" size={12} />
                  <Text style={styles.tagText}>{getPersonDisplayName(item)}</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: '#FEF2F2' }]}>
                  <Pill color="#EF4444" size={12} />
                  <Text style={[styles.tagText, { color: '#EF4444' }]}>{item.dosage || 1} Birim</Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => handleShare(item)} style={styles.actionBtn}>
                <Share2 color="#25D366" size={20} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
                <Trash2 color="#EF4444" size={20} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Henüz bir kayıt yok.</Text>}
        contentContainerStyle={{ padding: 16 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  content: { flex: 1 },
  medName: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  dateText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  tagRow: { flexDirection: 'row', marginTop: 8, gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tagText: { fontSize: 11, color: '#4B5563', fontWeight: 'bold', marginLeft: 4 },
  actionBtn: { padding: 8, marginLeft: 4 },
  empty: { textAlign: 'center', marginTop: 50, color: '#9CA3AF', fontStyle: 'italic' }
});
