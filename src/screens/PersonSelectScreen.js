import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal
} from 'react-native';
import { getPersons, addPerson, setActivePerson } from '../utils/storage';
import { useTranslation } from '../i18n/LanguageContext';
import { Users, ArrowRight, Plus, ShieldCheck, X } from 'lucide-react-native';

const AVATARS = ['🧑', '👩', '👴', '👵', '👦', '👧', '🧒', '👨', '🧔', '🙋'];

export default function PersonSelectScreen({ onPersonSelected }) {
  const { t } = useTranslation();
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🧑');
  const [saving, setSaving] = useState(false);

  // PIN Modal States
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [targetPerson, setTargetPerson] = useState(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    loadPersons();
  }, []);

  const loadPersons = async () => {
    setLoading(true);
    const data = await getPersons();
    setPersons(data);
    setLoading(false);
    if (data.length === 0) setShowAddForm(true);
  };

  const handlePersonPress = (person) => {
    if (person.canSeeAll && person.pin) {
      // Şifreli admin girişi
      setTargetPerson(person);
      setEnteredPin('');
      setPinError(false);
      setPinModalVisible(true);
    } else {
      // Şifresiz giriş
      completeLogin(person);
    }
  };

  const completeLogin = async (person) => {
    await setActivePerson(person.id);
    onPersonSelected(person);
  };

  const handlePinSubmit = () => {
    if (enteredPin === targetPerson.pin) {
      setPinModalVisible(false);
      completeLogin(targetPerson);
    } else {
      setPinError(true);
      setEnteredPin('');
    }
  };

  const handleAddAndSelect = async () => {
    if (!newName.trim()) { alert(t('pleaseEnterName')); return; }
    setSaving(true);
    await addPerson({ 
      name: newName.trim(), 
      avatar: selectedAvatar, 
      canSeeAll: false, // Yeni eklenenler varsayılan olarak admin değil
      receivesNotifications: true,
      pin: '' 
    });
    const updated = await getPersons();
    setPersons(updated);
    const created = updated.find(p => p.name === newName.trim());
    setSaving(false);
    setShowAddForm(false);
    setNewName('');
    if (created) completeLogin(created);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.headerBox}>
          <View style={styles.iconCircle}>
            <Users color="#059669" size={40} />
          </View>
          <Text style={styles.title}>{t('whoAreYou')}</Text>
          <Text style={styles.subtitle}>{t('selectForPersonalized')}</Text>
        </View>

        {persons.length > 0 && (
          <View style={styles.cardsBlock}>
            {persons.map((person) => (
              <TouchableOpacity
                key={person.id}
                style={styles.personCard}
                onPress={() => handlePersonPress(person)}
                activeOpacity={0.8}
              >
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarEmoji}>{person.avatar || '🧑'}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.personName}>{person.name}</Text>
                  {person.canSeeAll && (
                    <Text style={styles.adminBadge}>{t('adminBadge')}</Text>
                  )}
                </View>
                <ArrowRight color="#059669" size={22} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!showAddForm ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddForm(true)}>
            <Plus color="#059669" size={20} />
            <Text style={styles.addBtnText}>{t('newMember')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.addForm}>
            <Text style={styles.formTitle}>{t('welcomeNew')}</Text>
            <Text style={styles.formLabel}>{t('yourName')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('namePlaceholder')}
              value={newName}
              onChangeText={setNewName}
            />
            <Text style={styles.formLabel}>{t('selectAvatar')}</Text>
            <View style={styles.avatarGrid}>
              {AVATARS.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.avatarOption, selectedAvatar === emoji && styles.avatarOptionSelected]}
                  onPress={() => setSelectedAvatar(emoji)}
                >
                  <Text style={styles.avatarOptionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddAndSelect} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t('saveAndLogin')}</Text>}
            </TouchableOpacity>
            {persons.length > 0 && (
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddForm(false)}>
                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </ScrollView>

      {/* PIN Doğrulama Modalı */}
      <Modal visible={pinModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.pinContent}>
            <View style={styles.modalHeader}>
              <ShieldCheck color="#D97706" size={32} />
              <Text style={styles.modalTitle}>{t('securityLock')}</Text>
              <TouchableOpacity style={styles.closeModal} onPress={() => setPinModalVisible(false)}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalSub}>{targetPerson?.name} {t('enterPinFor')}</Text>
            
            <TextInput
              style={[styles.pinInput, pinError && styles.pinInputError]}
              placeholder="****"
              value={enteredPin}
              onChangeText={(val) => {
                setEnteredPin(val.replace(/[^0-9]/g, '').slice(0, 4));
                setPinError(false);
              }}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              autoFocus
            />
            
            {pinError && <Text style={styles.errorText}>{t('wrongPin')}</Text>}
            
            <TouchableOpacity style={styles.confirmBtn} onPress={handlePinSubmit}>
              <Text style={styles.confirmBtnText}>{t('saveAndLogin')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  scroll: { flexGrow: 1, padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBox: { alignItems: 'center', marginBottom: 30, marginTop: 20 },
  iconCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginBottom: 16, elevation: 4 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#6B7280', textAlign: 'center' },
  cardsBlock: { marginBottom: 16 },
  personCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, elevation: 3 },
  avatarCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarEmoji: { fontSize: 28 },
  cardInfo: { flex: 1 },
  personName: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  adminBadge: { fontSize: 12, color: '#D97706', fontWeight: 'bold', marginTop: 3 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#059669', borderStyle: 'dashed' },
  addBtnText: { color: '#059669', fontWeight: 'bold', fontSize: 15, marginLeft: 8 },
  addForm: { backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 3 },
  formTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  formLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20, gap: 10 },
  avatarOption: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  avatarOptionSelected: { borderColor: '#059669', backgroundColor: '#ECFDF5' },
  avatarOptionEmoji: { fontSize: 24 },
  saveBtn: { backgroundColor: '#059669', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cancelBtn: { alignItems: 'center', padding: 10 },
  cancelBtnText: { color: '#6B7280', textDecorationLine: 'underline' },

  // PIN Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pinContent: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 320, alignItems: 'center' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, width: '100%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827', flex: 1, marginLeft: 10 },
  closeModal: { padding: 5 },
  modalSub: { fontSize: 14, color: '#4B5563', textAlign: 'center', marginBottom: 20 },
  pinInput: { backgroundColor: '#F3F4F6', borderRadius: 12, width: 140, height: 60, textAlign: 'center', fontSize: 28, letterSpacing: 10, borderWidth: 2, borderColor: '#D1D5DB' },
  pinInputError: { borderColor: '#EF4444', backgroundColor: '#FEE2E2' },
  errorText: { color: '#EF4444', fontSize: 12, marginTop: 8, fontWeight: 'bold' },
  confirmBtn: { backgroundColor: '#D97706', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12, marginTop: 24 },
  confirmBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
