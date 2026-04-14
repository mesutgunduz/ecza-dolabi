import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMeds, getPersons, markAsTaken } from '../utils/storage';
import { AlertCircle, CheckCircle, User, Eye, EyeOff, Filter } from 'lucide-react-native';

export default function DashboardScreen() {
  const [meds, setMeds] = useState([]);
  const [persons, setPersons] = useState([]);
  const [lowStockMeds, setLowStockMeds] = useState([]);
  
  // Dashboard Filters
  const [filterPerson, setFilterPerson] = useState('all');
  const [hideEmpty, setHideEmpty] = useState(true);

  const loadData = async () => {
    const allMeds = await getMeds();
    const allPersons = await getPersons();
    setMeds(allMeds);
    setPersons(allPersons);
    
    // Check low stock
    const lowStock = allMeds.filter(m => {
      const q = parseFloat(m.quantity);
      if (m.unit === 'ml') return q <= 15 && q > 0;
      return q <= 5 && q > 0;
    });
    setLowStockMeds(lowStock);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const handleTakeMed = async (med) => {
    if (parseFloat(med.quantity) > 0) {
      const consumeAmt = med.consumePerUsage ? parseFloat(med.consumePerUsage) : 1;
      await markAsTaken(med.id, med.personId || 'all', consumeAmt);
      loadData();
    }
  };

  const getPersonName = (personId) => {
    if (personId === 'all' || !personId) return '🏠 Ev / Ortak';
    const person = persons.find(p => p.id === personId);
    return person ? person.name : '🏠 Ev / Ortak';
  };

  // Uygulanan Filtreler
  let displayedMeds = meds;
  if (filterPerson !== 'all') {
    displayedMeds = displayedMeds.filter(m => m.personId === filterPerson);
  }
  if (hideEmpty) {
    displayedMeds = displayedMeds.filter(m => parseFloat(m.quantity) > 0);
  }

  const FilterChips = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
      <TouchableOpacity 
        style={[styles.chip, filterPerson === 'all' && styles.chipSelected]} 
        onPress={() => setFilterPerson('all')}
      >
        <Text style={[styles.chipText, filterPerson === 'all' && styles.chipTextSelected]}>
          Tüm Aile
        </Text>
      </TouchableOpacity>
      {persons.map(item => (
        <TouchableOpacity 
          key={item.id} 
          style={[styles.chip, filterPerson === item.id && styles.chipSelected]} 
          onPress={() => setFilterPerson(item.id)}
        >
          <Text style={[styles.chipText, filterPerson === item.id && styles.chipTextSelected]}>
            {item.name}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
      
      {/* Filtre ve Kişi Seçim Barı */}
      <View style={styles.filterBox}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Filter color="#4B5563" size={16} />
          <Text style={styles.filterTitle}>Kime Ait İlaçları Görelim?</Text>
        </View>
        
        <FilterChips />

        <TouchableOpacity 
          style={[styles.toggleBtn, !hideEmpty && styles.toggleBtnActive]} 
          onPress={() => setHideEmpty(!hideEmpty)}
        >
          {hideEmpty ? <EyeOff color="#6B7280" size={18} /> : <Eye color="#059669" size={18} />}
          <Text style={[styles.toggleBtnText, !hideEmpty && styles.toggleBtnTextActive]}>
            {hideEmpty ? "Biten Kayıtlar Gizleniyor (Tıkla Göster)" : "Biten/Eski Kayıtlar Da Ekleniyor (Tıkla Gizle)"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Ek Bilgiler */}
      {lowStockMeds.length > 0 && filterPerson === 'all' && (
        <View style={styles.alertCard}>
          <View style={styles.alertHeader}>
            <AlertCircle color="#EF4444" size={24} />
            <Text style={styles.alertTitle}>Azalan İlaçlar Var</Text>
          </View>
          {lowStockMeds.map(m => (
            <Text key={m.id} style={styles.alertText}>
              • {m.name} ({getPersonName(m.personId)}) - Kalan: {m.quantity} {m.unit || 'Adet'}
            </Text>
          ))}
        </View>
      )}

      {/* Liste */}
      <Text style={styles.sectionTitle}>
        {filterPerson === 'all' ? 'Evdeki Tüm İlaçlarım' : 'Kişisel İlaçlar'} ({displayedMeds.length})
      </Text>
      
      {displayedMeds.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Buralar boş görünüyor...</Text>
          <Text style={styles.emptySubText}>Uygun ilaç bulunamadı veya tümü tükenmiş olabilir.</Text>
        </View>
      ) : (
        displayedMeds.map(med => {
          const isEmpty = parseFloat(med.quantity) <= 0;
          return (
            <View key={med.id} style={[styles.medCard, isEmpty && styles.medCardEmpty]}>
              <View style={styles.medInfo}>
                <Text style={[styles.medName, isEmpty && styles.medNameEmpty]}>
                  {med.name} {med.dose && <Text style={styles.doseText}>({med.dose})</Text>}
                </Text>
                <Text style={styles.medDetail}>
                  {med.form} - {isEmpty ? 'TÜKENDİ' : `Kalan: ${med.quantity} ${med.unit || 'Adet'}`}
                </Text>
                
                <View style={styles.personTag}>
                  <User color="#2563EB" size={14} />
                  <Text style={styles.personTagText}>{getPersonName(med.personId)}</Text>
                </View>

              </View>

              <TouchableOpacity 
                style={[styles.takeBtn, isEmpty && styles.takeBtnDisabled]}
                onPress={() => handleTakeMed(med)}
                disabled={isEmpty}
              >
                <CheckCircle color="#fff" size={20} />
                <View style={{marginLeft: 6}}>
                  <Text style={styles.takeBtnText}>{isEmpty ? 'Bitti' : 'Kullan'}</Text>
                  {!isEmpty && (
                    <Text style={styles.takeBtnSubText}>(-{med.consumePerUsage || 1} {med.unit || 'Adet'})</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', padding: 16 },
  
  filterBox: { backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  filterTitle: { fontSize: 14, fontWeight: 'bold', color: '#4B5563', marginLeft: 6 },
  chipScroll: { marginBottom: 16, marginTop: 4 },
  chip: { backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  chipSelected: { backgroundColor: '#059669', borderColor: '#059669' },
  chipText: { fontSize: 14, color: '#4B5563', fontWeight: 'bold' },
  chipTextSelected: { color: '#fff' },

  toggleBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', padding: 10, borderRadius: 8, justifyContent: 'center' },
  toggleBtnActive: { backgroundColor: '#ECFDF5' },
  toggleBtnText: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginLeft: 8 },
  toggleBtnTextActive: { color: '#059669' },

  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 12, marginTop: 4 },
  emptyBox: { alignItems: 'center', marginTop: 30 },
  emptyText: { color: '#4B5563', fontSize: 16, fontWeight: 'bold' },
  emptySubText: { color: '#9CA3AF', fontSize: 13, marginTop: 6 },

  alertCard: { backgroundColor: '#FEF2F2', padding: 16, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#FCA5A5' },
  alertHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  alertTitle: { fontSize: 16, fontWeight: 'bold', color: '#B91C1C', marginLeft: 8 },
  alertText: { fontSize: 14, color: '#991B1B', marginTop: 4 },
  
  medCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  medCardEmpty: { backgroundColor: '#F9FAFB', opacity: 0.7 },
  medInfo: { flex: 1 },
  medName: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  medNameEmpty: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  doseText: { fontSize: 14, fontWeight: 'normal', color: '#6b7280' },
  medDetail: { fontSize: 13, color: '#4b5563', marginTop: 4, fontWeight: 'bold' },
  personTag: { flexDirection: 'row', alignItems: 'center', marginTop: 6, backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  personTagText: { fontSize: 13, color: '#2563EB', marginLeft: 4, fontWeight: 'bold' },
  takeBtn: { flexDirection: 'row', backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  takeBtnDisabled: { backgroundColor: '#9CA3AF' },
  takeBtnText: { color: '#fff', fontWeight: 'bold' },
  takeBtnSubText: { color: '#D1FAE5', fontSize: 10, marginTop: 2 }
});
