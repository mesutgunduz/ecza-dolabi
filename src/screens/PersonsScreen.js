import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Modal, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getPersons, addPerson, deletePerson, editPerson, getMeds } from '../utils/storage';
import { Trash2, UserPlus, Edit2, X, Check, Plus } from 'lucide-react-native';

const AVATARS = ['👨', '👩', '👦', '👧', '👵', '👴', '👶', '👱‍♀️', '🧔', '👤'];
const RELATIONS = ['Ben', 'Eşim', 'Oğlum', 'Kızım', 'Diğer'];
const GENDERS = ['Erkek', 'Kadın'];

export default function PersonsScreen() {
  const [persons, setPersons] = useState([]);
  
  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form States
  const [name, setName] = useState('');
  const [gender, setGender] = useState('Erkek');
  const [relation, setRelation] = useState('Ben');
  const [birthdate, setBirthdate] = useState('');
  const [avatar, setAvatar] = useState('👤');

  const loadPersons = async () => {
    const data = await getPersons();
    setPersons(data);
  };

  useFocusEffect(useCallback(() => { loadPersons(); }, []));

  const openForm = (person = null) => {
    if (person) {
      setEditingId(person.id);
      setName(person.name || '');
      setGender(person.gender || 'Erkek');
      setRelation(person.relation || 'Diğer');
      setBirthdate(person.birthdate || '');
      setAvatar(person.avatar || '👤');
    } else {
      setEditingId(null);
      setName('');
      setGender('Erkek');
      setRelation('Ben');
      setBirthdate('');
      setAvatar('👤');
    }
    setModalVisible(true);
  };

  const calculateAge = (bdate) => {
    if (!bdate || !bdate.includes('.')) return null;
    try {
      const parts = bdate.split('.');
      if (parts.length === 3) {
        const y = parseInt(parts[2]);
        if (!isNaN(y) && y > 1900 && y <= new Date().getFullYear()) {
          return new Date().getFullYear() - y;
        }
      }
    } catch(e) {}
    return null;
  };

  const handleSave = async () => {
    if (name.trim() === '') {
      Alert.alert("Hata", "Kişi ismi boş olamaz.");
      return;
    }
    
    const payload = {
      name: name.trim(),
      gender,
      relation,
      birthdate,
      avatar
    };

    if (editingId) {
      await editPerson(editingId, payload);
    } else {
      await addPerson(payload);
    }
    
    setModalVisible(false);
    loadPersons();
  };

  const handleDelete = async (id) => {
    const allMeds = await getMeds();
    const hasMeds = allMeds.some(m => m.personId === id);
    if (hasMeds) {
      Alert.alert(
        "Kişi Silinemez! 🛑",
        "Silmeye çalıştığınız kişiye atanmış ilaçlar var. Bu kişiyi silmeden önce lüfen ilaçlarını 'Ortak' veya başka birine atayın."
      );
      return;
    }

    Alert.alert("Emin Misiniz?", "Bu kişiyi silmek istediğinize emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Sil", style: "destructive", onPress: async () => {
         await deletePerson(id);
         loadPersons();
      }}
    ]);
  };

  return (
    <View style={styles.container}>
      
      {/* Header & Add Button */}
      <View style={styles.headerArea}>
        <View>
          <Text style={styles.mainTitle}>Aile Bireyleri</Text>
          <Text style={styles.subTitle}>İlaç takibi yapılacak kişileri yönetin</Text>
        </View>
        <TouchableOpacity style={styles.mainAddBtn} onPress={() => openForm(null)}>
          <Plus color="#fff" size={24} />
        </TouchableOpacity>
      </View>

      {/* Profiles List */}
      <FlatList
        data={persons}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const age = calculateAge(item.birthdate);
          const isFemale = item.gender === 'Kadın';
          
          return (
            <View style={[styles.card, { borderLeftColor: isFemale ? '#EC4899' : '#3B82F6', borderLeftWidth: 4 }]}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarEmoji}>{item.avatar || '👤'}</Text>
              </View>
              
              <View style={styles.cardContent}>
                <Text style={styles.nameText}>{item.name}</Text>
                <View style={styles.tagsRow}>
                  {item.relation && (
                    <Text style={styles.tagText}>{item.relation}</Text>
                  )}
                  {age !== null && (
                    <Text style={styles.tagText}>• {age} Yaşında</Text>
                  )}
                  {item.gender && (
                    <Text style={[styles.tagText, { color: isFemale ? '#EC4899' : '#3B82F6' }]}>• {item.gender}</Text>
                  )}
                </View>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => openForm(item)} style={styles.actionBtn}>
                  <Edit2 color="#3B82F6" size={20} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
                  <Trash2 color="#EF4444" size={20} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>Henüz sisteme kimse eklenmemiş.</Text>}
      />

      {/* Modal Form */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <View style={styles.modalBg}>
          <ScrollView contentContainerStyle={{justifyContent:'center', flexGrow:1, padding: 16}}>
            <View style={styles.formBox}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                <Text style={styles.formTitle}>{editingId ? 'Kişiyi Düzenle' : 'Yeni Kişi Ekle'}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}><X color="#6B7280" size={24}/></TouchableOpacity>
              </View>

              {/* Avatar Selector */}
              <Text style={styles.label}>Avatar Seçimi (Profil Resmi):</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 20}}>
                {AVATARS.map((emoji, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={[styles.avatarSelectChip, avatar === emoji && styles.avatarSelectChipActive]}
                    onPress={() => setAvatar(emoji)}
                  >
                    <Text style={styles.avatarSelectEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>İsim:</Text>
              <TextInput
                style={styles.input}
                placeholder="Kişi ismini yazınız"
                value={name}
                onChangeText={setName}
              />

              <View style={styles.row}>
                <View style={{flex: 1, marginRight: 8}}>
                  <Text style={styles.label}>Doğum Tarihi:</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Örn: 24.10.1985"
                    value={birthdate}
                    onChangeText={setBirthdate}
                  />
                </View>
                <View style={{flex: 1, marginLeft: 8}}>
                  <Text style={styles.label}>Cinsiyet:</Text>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                    {GENDERS.map((g) => (
                      <TouchableOpacity 
                        key={g} 
                        style={[styles.smallChip, gender === g && (g === 'Erkek' ? styles.chipBlue : styles.chipPink)]}
                        onPress={() => setGender(g)}
                      >
                        <Text style={[styles.smallChipText, gender === g && {color: '#fff'}]}>{g}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <Text style={styles.label}>Yakınlık Derecesi:</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20}}>
                {RELATIONS.map(rel => (
                  <TouchableOpacity 
                    key={rel} 
                    style={[styles.relationChip, relation === rel && styles.relationChipActive]}
                    onPress={() => setRelation(rel)}
                  >
                    <Text style={[styles.relationChipText, relation === rel && {color: '#fff'}]}>{rel}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Check color="#fff" size={20} />
                <Text style={styles.saveBtnText}>Profili Kaydet</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  
  headerArea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  mainTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  subTitle: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  mainAddBtn: { backgroundColor: '#059669', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 3 },
  
  card: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  avatarCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarEmoji: { fontSize: 30 },
  cardContent: { flex: 1 },
  nameText: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  tagsRow: { flexDirection: 'row', marginTop: 6, flexWrap: 'wrap' },
  tagText: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginRight: 6 },
  actionBtn: { padding: 8, marginLeft: 2 },
  emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 40, fontSize: 15, fontStyle: 'italic' },

  // Modal Area
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  formBox: { backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 5 },
  formTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  
  label: { fontSize: 14, fontWeight: 'bold', color: '#4B5563', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, fontSize: 15, height: 46, marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  
  avatarSelectChip: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginRight: 10, borderWidth: 2, borderColor: 'transparent' },
  avatarSelectChipActive: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  avatarSelectEmoji: { fontSize: 24 },

  smallChip: { flex: 1, paddingVertical: 10, backgroundColor: '#F3F4F6', alignItems: 'center', borderRadius: 8, marginHorizontal: 4 },
  chipBlue: { backgroundColor: '#3B82F6' },
  chipPink: { backgroundColor: '#EC4899' },
  smallChipText: { fontWeight: '600', color: '#4B5563' },

  relationChip: { backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 8 },
  relationChipActive: { backgroundColor: '#059669' },
  relationChipText: { color: '#4B5563', fontWeight: 'bold', fontSize: 13 },

  saveBtn: { flexDirection: 'row', backgroundColor: '#10B981', padding: 14, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 }
});
