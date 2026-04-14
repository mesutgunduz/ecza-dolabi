import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, Modal, TextInput, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getLogs, getMeds, getPersons, deleteLog, editLog } from '../utils/storage';
import { Clock, User, Trash2, Pill, Filter, Edit2, X, Check, Share2 } from 'lucide-react-native';

export default function LogsScreen() {
  const [logs, setLogs] = useState([]);
  const [meds, setMeds] = useState([]);
  const [persons, setPersons] = useState([]);

  // Filtre State'leri
  const [filterPerson, setFilterPerson] = useState('all');
  const [filterMed, setFilterMed] = useState('all');

  // Edit State'leri
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingLogId, setEditingLogId] = useState(null);
  const [editPersonSelect, setEditPersonSelect] = useState('all');
  const [editDoseInput, setEditDoseInput] = useState('1');
  const [editDateInput, setEditDateInput] = useState(''); // 14.04.2026
  const [editTimeInput, setEditTimeInput] = useState(''); // 15:30

  const loadData = async () => {
    const l = await getLogs();
    const m = await getMeds();
    const p = await getPersons();
    
    const sortedLogs = l.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    setLogs(sortedLogs);
    setMeds(m);
    setPersons(p);
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const getPersonName = (personId) => {
    if(personId === 'all' || !personId) return '🏠 Ortak İlaç';
    const p = persons.find(x => x.id === personId);
    return p ? p.name : 'Silinmiş Kişi / Ortak';
  };

  const getMedInfo = (medId) => {
    const defaultInfo = { name: 'Silinmiş İlaç/Eski Kayıt', unit: 'Adet' };
    const m = meds.find(x => x.id === medId);
    return m ? m : defaultInfo;
  };

  const handleDeleteLog = async (id) => {
    await deleteLog(id);
    loadData();
  };

  const openEditModal = (log) => {
    setEditingLogId(log.id);
    setEditPersonSelect(log.personId || 'all');
    setEditDoseInput((log.dose || 1).toString());
    
    // Format timestamp to input values
    const d = new Date(log.timestamp || new Date().getTime());
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');

    setEditDateInput(`${day}.${month}.${year}`);
    setEditTimeInput(`${hours}:${mins}`);
    setEditModalVisible(true);
  };

  const saveLogEdit = async () => {
    let newTimestamp = new Date().getTime();
    try {
      if (editDateInput.includes('.') && editTimeInput.includes(':')) {
         const [d, m, y] = editDateInput.split('.');
         const [hrs, mins] = editTimeInput.split(':');
         // Ay -1 ile verilmeli
         const dateObj = new Date(parseInt(y), parseInt(m)-1, parseInt(d), parseInt(hrs), parseInt(mins));
         if (!isNaN(dateObj.getTime())) {
            newTimestamp = dateObj.getTime();
         }
      }
    } catch(e) {
      console.log("Date parsing failed. Using current time backup.");
    }

    await editLog(editingLogId, editPersonSelect, parseFloat(editDoseInput) || 1, newTimestamp);
    setEditModalVisible(false);
    loadData();
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Bilinmeyen Tarih';
    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}.${year} - ${hours}:${minutes}`;
  };

  // Whatsapp and Share logic
  const handleShare = async (log, med) => {
    const personName = getPersonName(log.personId);
    const timeInfo = formatDate(log.timestamp);
    const medName = med.name + (med.dose && med.dose !== '' ? ` (${med.dose})` : '');
    const amount = `${log.dose || 1} ${med.unit || 'Adet'}`;
  
    const message = `Bilgilendirme Raporu: \n💊 İlaç: ${medName} \n👤 Kullanan Kişi: ${personName} \n🕒 Saat/Tarih: ${timeInfo} \n📊 Tüketim Miktarı: ${amount}`;
    
    try {
      await Share.share({ message });
    } catch (error) {
      console.log('Share Error:', error.message);
    }
  };

  const handlePersonSelect = (personId) => {
    setFilterPerson(personId);
    setFilterMed('all');
  };

  const availableMeds = filterPerson === 'all' 
    ? meds 
    : meds.filter(m => m.personId === filterPerson);

  const filteredLogs = logs.filter(log => {
    const personMatch = filterPerson === 'all' || log.personId === filterPerson;
    const medMatch = filterMed === 'all' || log.medId === filterMed;
    return personMatch && medMatch;
  });

  const FilterChips = ({ items, selectedValue, onSelect, type }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
      <TouchableOpacity 
        style={[styles.chip, selectedValue === 'all' && styles.chipSelected]} 
        onPress={() => onSelect('all')}
      >
        <Text style={[styles.chipText, selectedValue === 'all' && styles.chipTextSelected]}>
          Tümü
        </Text>
      </TouchableOpacity>
      {items.map(item => (
        <TouchableOpacity 
          key={item.id} 
          style={[styles.chip, selectedValue === item.id && styles.chipSelected]} 
          onPress={() => onSelect(item.id)}
        >
          <Text style={[styles.chipText, selectedValue === item.id && styles.chipTextSelected]}>
            {item.name.length > 15 ? item.name.substring(0,15)+'..' : item.name}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      
      {/* Edit Modal */}
      <Modal visible={editModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalBg}>
          <ScrollView contentContainerStyle={{justifyContent:'center', flexGrow:1, alignItems:'center', width:'100%'}}>
            <View style={styles.editBox}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15}}>
                <Text style={{fontSize: 16, fontWeight: 'bold'}}>Geçmişi Düzenle</Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}><X color="#000" size={24}/></TouchableOpacity>
              </View>

              <Text style={styles.filterLabel}>Kullanan Kişi:</Text>
              <FilterChips items={persons} selectedValue={editPersonSelect} onSelect={setEditPersonSelect} type="person" />

              <Text style={styles.filterLabel}>Miktar (ML/Adet):</Text>
              <TextInput 
                style={styles.doseInput} 
                keyboardType="numeric" 
                value={editDoseInput} 
                onChangeText={setEditDoseInput} 
              />

              <View style={styles.dateTimeRow}>
                <View style={{flex: 1, marginRight: 5}}>
                  <Text style={styles.filterLabel}>Tarih (GG.AA.YYYY):</Text>
                  <TextInput 
                    style={styles.doseInput} 
                    value={editDateInput} 
                    onChangeText={setEditDateInput} 
                  />
                </View>
                <View style={{flex: 1, marginLeft: 5}}>
                  <Text style={styles.filterLabel}>Saat (SS:DD):</Text>
                  <TextInput 
                    style={styles.doseInput} 
                    value={editTimeInput} 
                    onChangeText={setEditTimeInput} 
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={saveLogEdit}>
                <Check color="#fff" size={20} />
                <Text style={styles.saveBtnText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <View style={styles.filterBox}>
        <View style={styles.filterTitleRow}>
          <Filter color="#4B5563" size={16} />
          <Text style={styles.filterHeader}>Sorgula & Filtrele</Text>
        </View>
        <Text style={styles.filterLabel}>Kişiye Göre:</Text>
        <FilterChips items={persons} selectedValue={filterPerson} onSelect={handlePersonSelect} type="person" />
        <Text style={styles.filterLabel}>
          {filterPerson === 'all' ? 'Tüm İlaçlar:' : `${getPersonName(filterPerson)}'e Ait İlaçlar:`}
        </Text>
        <FilterChips items={availableMeds} selectedValue={filterMed} onSelect={setFilterMed} type="med" />
      </View>

      <Text style={styles.title}>Kayıtlı Geçmiş ({filteredLogs.length})</Text>
      
      <FlatList
        data={filteredLogs}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const med = getMedInfo(item.medId);
          return (
            <View style={styles.card}>
              <View style={styles.iconBox}>
                <Clock color="#059669" size={24} />
              </View>
              <View style={styles.content}>
                <Text style={styles.medName}>
                  {med.name} {med.dose && med.dose !== '' ? `(${med.dose})` : ''}
                </Text>
                <Text style={styles.dateText}>{formatDate(item.timestamp)}</Text>
                <View style={styles.row}>
                  <View style={styles.tag}>
                    <User color="#2563EB" size={12} />
                    <Text style={styles.tagText}>{getPersonName(item.personId)}</Text>
                  </View>
                  <View style={[styles.tag, { backgroundColor: '#FEE2E2', marginLeft: 8 }]}>
                    <Pill color="#DC2626" size={12} />
                    <Text style={[styles.tagText, { color: '#DC2626' }]}>
                      Miktar: {item.dose || 1} {med.unit || 'Adet'}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={{flexDirection:'row', alignItems: 'center'}}>
                <TouchableOpacity onPress={() => handleShare(item, med)} style={styles.actionBtn}>
                  <Share2 color="#10B981" size={20} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionBtn}>
                  <Edit2 color="#3B82F6" size={20} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteLog(item.id)} style={styles.actionBtn}>
                  <Trash2 color="#EF4444" size={20} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>Bu filtreye ait kayıtlı ilaç geçmişi bulunamadı.</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', padding: 16 },
  filterBox: { backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  filterTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 8 },
  filterHeader: { fontSize: 15, fontWeight: 'bold', color: '#4B5563', marginLeft: 6 },
  filterLabel: { fontSize: 12, color: '#6B7280', fontWeight: 'bold', marginBottom: 6 },
  chipScroll: { marginBottom: 12 },
  chip: { backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  chipSelected: { backgroundColor: '#059669', borderColor: '#059669' },
  chipText: { fontSize: 13, color: '#4B5563', fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  title: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 40, fontStyle: 'italic' },
  card: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  iconBox: { backgroundColor: '#ECFDF5', padding: 10, borderRadius: 10, marginRight: 16 },
  content: { flex: 1 },
  medName: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  dateText: { fontSize: 13, color: '#4B5563', marginTop: 4, fontWeight: '600' },
  row: { flexDirection: 'row', marginTop: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tagText: { fontSize: 12, color: '#2563EB', marginLeft: 4, fontWeight: 'bold' },
  actionBtn: { padding: 8, marginLeft: 2 },

  // Edit Modal Styles
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  editBox: { width: '90%', backgroundColor: '#fff', borderRadius: 12, padding: 20, elevation: 5, alignSelf: 'center', marginTop: 50 },
  doseInput: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, fontSize: 16, height: 44, marginBottom: 15 },
  dateTimeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  saveBtn: { flexDirection: 'row', backgroundColor: '#3B82F6', padding: 12, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 }
});
