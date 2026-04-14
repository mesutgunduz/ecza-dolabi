import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Modal, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { searchMedicineFromAPI, searchBarcodeFromAPI } from '../utils/api';
import { getMeds, addMed, deleteMed, editMed, getPersons } from '../utils/storage';
import { Search, Plus, Trash2, X, User, Edit3, QrCode, Edit2 } from 'lucide-react-native';

export default function MedsScreen() {
  const [meds, setMeds] = useState([]);
  const [filteredMeds, setFilteredMeds] = useState([]);
  const [cabinetSearchQuery, setCabinetSearchQuery] = useState('');
  const [persons, setPersons] = useState([]);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  
  const [manualMode, setManualMode] = useState(false);
  const [editingMedId, setEditingMedId] = useState(null); // Edit mod
  const [customName, setCustomName] = useState('');
  const [customGeneric, setCustomGeneric] = useState('');
  const [customDose, setCustomDose] = useState('');
  
  const [formType, setFormType] = useState('Tablet');
  const [quantity, setQuantity] = useState('20');
  const [consumePerUsage, setConsumePerUsage] = useState('1');
  const [selectedPerson, setSelectedPerson] = useState(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanned, setScanned] = useState(false);

  const getUnitFromForm = (form) => {
    const fLower = form.toLocaleLowerCase('tr-TR');
    if (fLower.includes('şurup') || fLower.includes('süspansiyon')) return 'ml';
    if (fLower.includes('damla')) return 'damla';
    if (fLower.includes('krem') || fLower.includes('merhem') || fLower.includes('jel')) return 'gr';
    return 'Adet';
  };

  const loadData = async () => {
    const medsData = await getMeds();
    const personsData = await getPersons();
    setMeds(medsData);
    setFilteredMeds(medsData);
    setPersons(personsData);
    if (!selectedPerson) setSelectedPerson('all');
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleCabinetSearch = (text) => {
    setCabinetSearchQuery(text);
    if (!text) { setFilteredMeds(meds); return; }
    const lowerText = text.toLocaleLowerCase('tr-TR');
    setFilteredMeds(meds.filter(m => 
      m.name.toLocaleLowerCase('tr-TR').includes(lowerText) ||
      (m.genericName && m.genericName.toLocaleLowerCase('tr-TR').includes(lowerText))
    ));
  };

  const handleApiSearch = async (text) => {
    setSearchQuery(text);
    if (text.length >= 2) {
      const results = await searchMedicineFromAPI(text);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const startManualWithAPI = (item) => {
    setCustomName(item.name);
    setCustomGeneric(item.genericName);
    setFormType(item.form);
    if (item.form.toLocaleLowerCase('tr-TR').includes('şurup')) {
      setQuantity('150'); setConsumePerUsage('5');
    } else {
      setQuantity('20'); setConsumePerUsage('1');
    }
    setManualMode(true);
  };

  const startEmptyManual = () => {
    setCustomName(searchQuery);
    setManualMode(true);
  };

  const handleEditPress = (item) => {
    setEditingMedId(item.id);
    setCustomName(item.name);
    setCustomGeneric(item.genericName || '');
    setCustomDose(item.dose || '');
    setFormType(item.form || 'Tablet');
    setQuantity(item.quantity ? item.quantity.toString() : '20');
    setConsumePerUsage(item.consumePerUsage ? item.consumePerUsage.toString() : '1');
    if (item.personId) setSelectedPerson(item.personId);
    
    setManualMode(true);
    setModalVisible(true);
  };

  const saveMedFinal = async () => {
    if (!selectedPerson) { alert("Önce kişi seçin!"); return; }
    if (!customName.trim()) { alert("İlaç ismi girmelisiniz."); return; }

    const payload = {
      name: customName,
      form: formType,
      genericName: customGeneric,
      dose: customDose,
      quantity: quantity,
      consumePerUsage: consumePerUsage,
      unit: getUnitFromForm(formType),
      personId: selectedPerson
    };

    if (editingMedId) {
      await editMed(editingMedId, payload);
    } else {
      await addMed(payload);
    }

    setModalVisible(false);
    resetModal();
    loadData();
  };

  const resetModal = () => {
    setSearchQuery(''); setSearchResults([]); setManualMode(false);
    setCustomName(''); setCustomGeneric(''); setCustomDose('');
    setQuantity('20'); setConsumePerUsage('1'); setFormType('Tablet');
    setEditingMedId(null);
  };

  const handleDelete = async (id) => { await deleteMed(id); loadData(); };

  const getPersonName = (id) => {
    if (id === 'all' || !id) return '🏠 Ev / Ortak';
    const p = persons.find(p => p.id === id); return p ? p.name : '🏠 Ev / Ortak';
  };

  const handleBarcodeIconPress = async () => {
    if (!permission) await requestPermission();
    if (permission && !permission.granted) await requestPermission();
    setScanned(false);
    setScannerVisible(true);
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    if (scanned) return;
    setScanned(true);
    setScannerVisible(false);
    
    const result = await searchBarcodeFromAPI(data);
    if (result) {
      startManualWithAPI(result);
    } else {
      Alert.alert("Bulunamadı", "Bu barkod bulunamadı. Lütfen ilacın ismini elle giriniz.");
      setSearchQuery(data);
    }
  };

  return (
    <View style={styles.container}>
      {scannerVisible && (
        <Modal visible={scannerVisible} transparent={false} animationType="slide">
           <View style={{ flex: 1, backgroundColor: 'black' }}>
             <CameraView
               onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
               barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "qr", "upc_a"] }}
               style={StyleSheet.absoluteFillObject}
             />
             <View style={styles.scannerOverlayInfo}>
               <Text style={styles.scannerOverlayText}>İlacın Barkodunu veya Karekodunu Okutun</Text>
             </View>
             <TouchableOpacity style={styles.closeScannerBtn} onPress={() => setScannerVisible(false)}>
               <X color="#fff" size={30} />
             </TouchableOpacity>
           </View>
        </Modal>
      )}

      <View style={styles.headerArea}>
        <View style={styles.cabSearchSection}>
          <Search color="#6b7280" size={20} style={{marginLeft: 10}}/>
          <TextInput
            style={styles.cabSearchInput}
            placeholder="Dolaptan ilaç ara..."
            value={cabinetSearchQuery}
            onChangeText={handleCabinetSearch}
          />
        </View>
        <TouchableOpacity style={styles.openModalBtn} onPress={() => {resetModal(); setModalVisible(true);}}>
          <Plus color="#fff" size={20} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredMeds}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name} {item.dose && <Text style={styles.doseTxt}>({item.dose})</Text>}</Text>
              <Text style={styles.detail}>{item.form} | Kalan: {item.quantity} {item.unit || 'Adet'} (-{item.consumePerUsage || 1})</Text>
              <View style={styles.personTag}>
                <User color="#059669" size={12} />
                <Text style={styles.personTagText}>{getPersonName(item.personId)}</Text>
              </View>
            </View>
            <View style={{flexDirection: 'row'}}>
              <TouchableOpacity onPress={() => handleEditPress(item)} style={styles.actionBtn}>
                <Edit2 color="#3B82F6" size={20} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
                <Trash2 color="#EF4444" size={20} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Aradığınız ilaç dolapta bulunamadı.</Text>}
      />

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingMedId ? "İlacı Düzenle" : (manualMode ? "İlaç Detayları" : "Yeni İlaç Bul / Ekle")}
            </Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <X color="#111827" size={24} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false}>
            {!manualMode && !editingMedId ? (
              <View>
                <Text style={styles.label}>Önce İlacı Bulalım (İsim veya Barkod):</Text>
                <View style={styles.searchRowWithBarcode}>
                  <TextInput
                    style={styles.bigSearchInputRow}
                    placeholder="Örn: Ritalin, Attex, vb."
                    value={searchQuery}
                    onChangeText={handleApiSearch}
                  />
                  <TouchableOpacity style={styles.barcodeBtn} onPress={handleBarcodeIconPress}>
                    <QrCode color="#fff" size={24} />
                  </TouchableOpacity>
                </View>
                
                {searchResults.length > 0 && <Text style={styles.subLabel}>Sonuçlardan Seçip Ekle:</Text>}

                {searchResults.map((item) => (
                  <TouchableOpacity key={item.id} style={styles.searchItemCard} onPress={() => startManualWithAPI(item)}>
                    <Text style={styles.searchItemName}>{item.name}</Text>
                    <Text style={styles.searchItemDesc}>{item.form} - {item.genericName}</Text>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity style={styles.manualFallbackBtn} onPress={startEmptyManual}>
                  <Edit3 color="#059669" size={18} />
                  <Text style={styles.manualFallbackBtnText}>Aradığım listede yok, ilacın tüm bilgilerini elimle yazacağım.</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.label}>Bu ilaç kimin için?</Text>
                <View style={styles.personSelectionRow}>
                  <TouchableOpacity 
                    style={[styles.personChip, selectedPerson === 'all' && styles.personChipSelected]}
                    onPress={() => setSelectedPerson('all')}
                  >
                    <Text style={[styles.personChipText, selectedPerson === 'all' && styles.personChipTextSelected]}>🏠 Ev (Ortak)</Text>
                  </TouchableOpacity>
                  {persons.map(p => (
                    <TouchableOpacity 
                      key={p.id} 
                      style={[styles.personChip, selectedPerson === p.id && styles.personChipSelected]}
                      onPress={() => setSelectedPerson(p.id)}
                    >
                      <Text style={[styles.personChipText, selectedPerson === p.id && styles.personChipTextSelected]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>İlaç Adı:</Text>
                <TextInput style={styles.input} value={customName} onChangeText={setCustomName} placeholder="Örn: Ritalin" />

                <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                  <View style={{flex: 1, marginRight: 10}}>
                    <Text style={styles.label}>Form/Tür:</Text>
                    <TextInput style={styles.input} value={formType} onChangeText={(txt) => {
                      setFormType(txt);
                      if(txt.toLocaleLowerCase('tr-TR').includes('şurup') && consumePerUsage==='1') setConsumePerUsage('5');
                    }} placeholder="Tablet, Şurup, Merhem" />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={styles.label}>Özellik/Mg:</Text>
                    <TextInput style={styles.input} value={customDose} onChangeText={setCustomDose} placeholder="Örn: 10mg" />
                  </View>
                </View>

                <View style={styles.calcBox}>
                  <Text style={styles.calcBoxTitle}>Miktar ve Tüketim Hesaplaması ({getUnitFromForm(formType)})</Text>
                  
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Mevcut Kutu Miktarı{"\n"}(Örn: Şurup ise 150):</Text>
                    <TextInput style={styles.qtyInput} keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
                  </View>

                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>"İçildi" butonuna basınca düşülecek miktar (Örn: 5):</Text>
                    <TextInput style={styles.qtyInput} keyboardType="numeric" value={consumePerUsage} onChangeText={setConsumePerUsage} />
                  </View>
                </View>

                <TouchableOpacity style={[styles.finalSaveBtn, editingMedId && {backgroundColor: '#3B82F6'}]} onPress={saveMedFinal}>
                  <Text style={styles.finalSaveBtnText}>{editingMedId ? 'Güncellemeyi Kaydet' : 'Dolaba Kaydet'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.backBtnText}>İptal</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  headerArea: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, alignItems: 'center', elevation: 2 },
  cabSearchSection: { flex: 1, flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 8, alignItems: 'center', height: 44 },
  cabSearchInput: { flex: 1, paddingHorizontal: 10, fontSize: 16 },
  openModalBtn: { backgroundColor: '#059669', width: 44, height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  card: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  doseTxt: { fontSize: 14, fontWeight: 'normal', color: '#6b7280' },
  detail: { fontSize: 14, color: '#6b7280', marginTop: 4, fontWeight: 'bold' },
  personTag: { flexDirection: 'row', alignItems: 'center', marginTop: 6, backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  personTagText: { fontSize: 12, color: '#059669', marginLeft: 4, fontWeight: 'bold' },
  actionBtn: { padding: 8, marginLeft: 5 },
  emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 40 },
  
  modalContainer: { flex: 1, backgroundColor: '#f3f4f6', paddingTop: 30, paddingHorizontal: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  label: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 8, marginTop: 10 },
  subLabel: { fontSize: 12, color: '#6b7280', marginTop: 16, marginBottom: 8, fontWeight: 'bold' },

  searchRowWithBarcode: { flexDirection: 'row', alignItems: 'center' },
  bigSearchInputRow: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 16, borderRadius: 8, fontSize: 16, height: 50, borderWidth: 1, borderColor: '#d1d5db' },
  barcodeBtn: { backgroundColor: '#000', width: 50, height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginLeft: 10 },

  searchItemCard: { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#3B82F6' },
  searchItemName: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  searchItemDesc: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  manualFallbackBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', padding: 16, borderRadius: 8, marginTop: 20, borderWidth: 1, borderColor: '#A7F3D0', borderStyle: 'dashed' },
  manualFallbackBtnText: { color: '#059669', fontWeight: 'bold', marginLeft: 8, flex: 1 },

  personSelectionRow: { flexDirection: 'row', flexWrap: 'wrap' },
  personChip: { backgroundColor: '#e5e7eb', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 8 },
  personChipSelected: { backgroundColor: '#059669' },
  personChipText: { color: '#374151', fontWeight: 'bold' },
  personChipTextSelected: { color: '#ffffff' },

  input: { backgroundColor: '#fff', paddingHorizontal: 12, borderRadius: 6, fontSize: 15, height: 44, borderWidth: 1, borderColor: '#d1d5db' },

  calcBox: { backgroundColor: '#E0F2FE', padding: 16, borderRadius: 8, marginTop: 20, borderWidth: 1, borderColor: '#BAE6FD' },
  calcBoxTitle: { fontSize: 14, fontWeight: 'bold', color: '#0284C7', marginBottom: 12 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  calcLabel: { flex: 1, fontSize: 13, color: '#0369A1', paddingRight: 10 },
  qtyInput: { width: 70, height: 40, backgroundColor: '#fff', textAlign: 'center', borderRadius: 6, fontWeight: 'bold', borderWidth: 1, borderColor: '#7DD3FC' },
  
  finalSaveBtn: { backgroundColor: '#059669', padding: 16, borderRadius: 8, marginTop: 30, alignItems: 'center' },
  finalSaveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  backBtn: { padding: 16, alignItems: 'center', marginTop: 5 },
  backBtnText: { color: '#6b7280', textDecorationLine: 'underline' },

  closeScannerBtn: { position: 'absolute', top: 50, right: 30, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 50 },
  scannerOverlayInfo: { position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center' },
  scannerOverlayText: { color: '#fff', fontSize: 16, fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.7)', padding: 12, borderRadius: 8 }
});
