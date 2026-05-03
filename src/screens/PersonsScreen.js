import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Modal, ScrollView, Alert, Platform, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getPersons, addPerson, deletePerson, editPerson, getMeds, getNotificationTargetPersonIds, setNotificationTargetPersonIds } from '../utils/storage';
import { Trash2, Edit2, X, Check, Plus, Bell } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from '../i18n/LanguageContext';

const AVATARS = ['🧑', '👨', '👩', '👱‍♂️', '👱‍♀️', '🧔', '👦', '👧', '👴', '👵', '👶', '👤'];
const RELATIONS = ['Ben', 'Eşim', 'Oğlum', 'Kızım', 'Diğer'];
const GENDERS = ['Erkek', 'Kadın'];
export const PERSON_COLORS = ['#059669', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#06B6D4', '#84CC16'];

export default function PersonsScreen({ activePerson, onNotificationTargetsChange }) {
  const { t } = useTranslation();
  const [persons, setPersons] = useState([]);
  const [notificationTargets, setNotificationTargets] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [name, setName] = useState('');
  const [gender, setGender] = useState('Erkek');
  const [relation, setRelation] = useState('Ben');
  const [birthdate, setBirthdate] = useState('');
  const [avatar, setAvatar] = useState('👤');
  const [canSeeAll, setCanSeeAll] = useState(false);
  const [receivesNotifications, setReceivesNotifications] = useState(true);
  const [pin, setPin] = useState('');
  const [color, setColor] = useState(PERSON_COLORS[0]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const translateRelation = (value) => {
    if (value === 'Ben') return t('selfRelation');
    if (value === 'Eşim') return t('spouseRelation');
    if (value === 'Oğlum') return t('sonRelation');
    if (value === 'Kızım') return t('daughterRelation');
    if (value === 'Diğer') return t('otherRelation');
    return value;
  };

  const translateGender = (value) => {
    if (value === 'Erkek') return t('male');
    if (value === 'Kadın') return t('female');
    return value;
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (event?.type === 'set' && selectedDate) {
      const day = selectedDate.getDate().toString().padStart(2, '0');
      const month = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
      const year = selectedDate.getFullYear();
      setBirthdate(`${day}.${month}.${year}`);
    }
  };

  const loadPersons = async () => {
    const data = await getPersons();
    const storedTargets = await getNotificationTargetPersonIds(activePerson?.id);
    const validTargetIds = storedTargets.filter((personId) => data.some((person) => person.id === personId));

    setNotificationTargets(validTargetIds);
    if (validTargetIds.length !== storedTargets.length) {
      await setNotificationTargetPersonIds(validTargetIds);
    }
    setPersons(data);
  };

  useFocusEffect(useCallback(() => { loadPersons(); }, [activePerson?.id]));

  const handleNotificationTargetToggle = async (personId) => {
    const nextTargets = notificationTargets.includes(personId)
      ? notificationTargets.filter((id) => id !== personId)
      : [...notificationTargets, personId];

    setNotificationTargets(nextTargets);
    const savedTargets = await setNotificationTargetPersonIds(nextTargets);
    await onNotificationTargetsChange?.(savedTargets);
  };

  const openForm = (person = null) => {
    if (person) {
      setEditingId(person.id);
      setName(person.name || '');
      setGender(person.gender || 'Erkek');
      setRelation(person.relation || 'Diğer');
      setBirthdate(person.birthdate || '');
      setAvatar(person.avatar || '👤');
      setCanSeeAll(person.canSeeAll === true);
      setReceivesNotifications(person.receivesNotifications !== false);
      setPin(person.pin || '');
      setColor(person.color || PERSON_COLORS[0]);
    } else {
      setEditingId(null);
      setName('');
      setGender('Erkek');
      setRelation('Ben');
      setBirthdate('');
      setAvatar('👤');
      setCanSeeAll(false);
      setReceivesNotifications(true);
      setPin('');
      // Auto-pick an unused color
      const usedColors = persons.map(p => p.color).filter(Boolean);
      const freeColor = PERSON_COLORS.find(c => !usedColors.includes(c)) || PERSON_COLORS[0];
      setColor(freeColor);
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
    if (name.trim() === '') { Alert.alert(t('error'), t('personNameRequired')); return; }
    const payload = { 
      name: name.trim(), 
      gender, 
      relation, 
      birthdate, 
      avatar, 
      canSeeAll,
      receivesNotifications,
      pin: canSeeAll ? pin : '',
      color,
    };
    if (editingId) { await editPerson(editingId, payload); }
    else { await addPerson(payload); }

    if (editingId && receivesNotifications === false && notificationTargets.includes(editingId)) {
      const nextTargets = notificationTargets.filter((id) => id !== editingId);
      setNotificationTargets(nextTargets);
      const savedTargets = await setNotificationTargetPersonIds(nextTargets);
      await onNotificationTargetsChange?.(savedTargets);
    }

    setModalVisible(false);
    loadPersons();
  };

  const handleDelete = async (id) => {
    const allMeds = await getMeds();
    if (allMeds.some(m => m.personId === id && m.isActive !== false)) {
      if (Platform.OS === 'web') {
        alert(`${t('personDeleteBlocked')}\n${t('personDeleteBlockedDesc')}`);
      } else {
        Alert.alert(t('personDeleteBlocked'), t('personDeleteBlockedDesc'));
      }
      return;
    }

    const pDelete = async () => {
      await deletePerson(id);
      if (notificationTargets.includes(id)) {
        const nextTargets = notificationTargets.filter((personId) => personId !== id);
        setNotificationTargets(nextTargets);
        const savedTargets = await setNotificationTargetPersonIds(nextTargets);
        await onNotificationTargetsChange?.(savedTargets);
      }
      loadPersons();
    };

    if (Platform.OS === 'web') {
      if (window.confirm(t('confirmDeletePerson'))) pDelete();
    } else {
      Alert.alert(t('areYouSure'), t('confirmDeletePerson'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: pDelete }
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerArea}>
        <View>
          <Text style={styles.mainTitle}>{t('familyMembers')}</Text>
          <Text style={styles.subTitle}>{t('managePersons')}</Text>
        </View>
        <TouchableOpacity style={styles.mainAddBtn} onPress={() => openForm(null)}>
          <Plus color="#fff" size={24} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={persons}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const age = calculateAge(item.birthdate);
          const isFemale = item.gender === 'Kadın';
          return (
            <View style={[styles.card, { borderLeftColor: item.color || (isFemale ? '#EC4899' : '#3B82F6'), borderLeftWidth: 4 }]}>
              <View style={styles.avatarCircle}><Text style={styles.avatarEmoji}>{item.avatar || '👤'}</Text></View>
              <View style={styles.cardContent}>
                <Text style={styles.nameText}>{item.name}</Text>
                <View style={styles.tagsRow}>
                  {item.relation && <Text style={styles.tagText}>{translateRelation(item.relation)}</Text>}
                  {age !== null && <Text style={styles.tagText}>• {age} {t('ageYearsOld')}</Text>}
                  {item.gender && <Text style={[styles.tagText, { color: isFemale ? '#EC4899' : '#3B82F6' }]}>• {translateGender(item.gender)}</Text>}
                </View>
                <Text style={styles.deviceNotifText}>
                  {item.receivesNotifications === false
                    ? t('notificationsOff')
                    : notificationTargets.includes(item.id)
                      ? t('notificationsOnThisDevice')
                      : t('notificationsOffThisDevice')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  style={[
                    styles.notifyTargetBtn,
                    item.receivesNotifications !== false && notificationTargets.includes(item.id) && styles.notifyTargetBtnActive,
                    item.receivesNotifications === false && styles.notifyTargetBtnDisabled,
                  ]}
                  disabled={item.receivesNotifications === false}
                  onPress={() => handleNotificationTargetToggle(item.id)}
                >
                  <Bell color={item.receivesNotifications === false ? '#9CA3AF' : notificationTargets.includes(item.id) ? '#fff' : '#059669'} size={16} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.seeAllBtn, item.canSeeAll && styles.seeAllBtnActive]}
                  onPress={async () => { await editPerson(item.id, { ...item, canSeeAll: !item.canSeeAll }); loadPersons(); }}
                >
                  <Text style={styles.seeAllBtnText}>{item.canSeeAll ? '👑' : '🔒'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openForm(item)} style={styles.actionBtn}><Edit2 color="#3B82F6" size={20} /></TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}><Trash2 color="#EF4444" size={20} /></TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('emptyPersons')}</Text>}
      />

      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <View style={styles.modalBg}>
          <ScrollView contentContainerStyle={{justifyContent:'center', flexGrow:1, padding: 16}}>
            <View style={styles.formBox}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                <Text style={styles.formTitle}>{editingId ? t('editPerson') : t('newPerson')}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}><X color="#6B7280" size={24}/></TouchableOpacity>
              </View>
              <Text style={styles.label}>{t('personColorLabel')}:</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 }}>
                {PERSON_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setColor(c)}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c },
                      color === c && styles.colorCircleActive,
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.label}>{t('avatarSelection')}:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10}}>
                {AVATARS.map((emoji, idx) => (
                  <TouchableOpacity key={idx} style={[styles.avatarSelectChip, avatar === emoji && styles.avatarSelectChipActive]} onPress={() => setAvatar(emoji)}>
                    <Text style={styles.avatarSelectEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.label}>{t('personName')}:</Text>
              <TextInput style={styles.input} placeholder={t('namePlaceholder')} value={name} onChangeText={setName} />
              <View style={styles.row}>
                <View style={{flex: 1, marginRight: 8}}>
                  <Text style={styles.label}>{t('birthdate')}:</Text>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <TextInput style={[styles.input, {flex: 1, marginBottom: 0}]} placeholder="24.10.1985" value={birthdate} onChangeText={setBirthdate} />
                    <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{marginLeft: 5, padding: 10, backgroundColor: '#E5E7EB', borderRadius: 8}}><Text>📅</Text></TouchableOpacity>
                  </View>
                </View>
                <View style={{flex: 1, marginLeft: 8}}>
                  <Text style={styles.label}>{t('gender')}:</Text>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                    {GENDERS.map((g) => (
                      <TouchableOpacity key={g} style={[styles.smallChip, gender === g && (g === 'Erkek' ? styles.chipBlue : styles.chipPink)]} onPress={() => setGender(g)}>
                        <Text style={[styles.smallChipText, gender === g && {color: '#fff'}]}>{translateGender(g)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
              <Text style={styles.label}>{t('relation')}:</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15}}>
                {RELATIONS.map(rel => (
                  <TouchableOpacity key={rel} style={[styles.relationChip, relation === rel && styles.relationChipActive]} onPress={() => setRelation(rel)}>
                    <Text style={[styles.relationChipText, relation === rel && {color: '#fff'}]}>{translateRelation(rel)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.permissionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.permissionLabel}>👑 {t('canSeeWholeFamily')}</Text>
                  <Text style={styles.permissionDesc}> {t('canSeeWholeFamilyDesc')}</Text>
                </View>
                <TouchableOpacity onPress={() => setCanSeeAll(!canSeeAll)} style={[styles.toggleSwitch, canSeeAll && styles.toggleSwitchOn]}>
                  <View style={[styles.toggleKnob, canSeeAll && styles.toggleKnobOn]} />
                </TouchableOpacity>
              </View>
              <View style={styles.permissionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.permissionLabel}>🔔 {t('canReceiveNotifications')}</Text>
                  <Text style={styles.permissionDesc}>{t('canReceiveNotificationsDesc')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setReceivesNotifications(!receivesNotifications)}
                  style={[styles.toggleSwitch, receivesNotifications && styles.toggleSwitchOn]}
                >
                  <View style={[styles.toggleKnob, receivesNotifications && styles.toggleKnobOn]} />
                </TouchableOpacity>
              </View>
              {canSeeAll && (
                <View style={styles.pinBox}>
                  <Text style={styles.label}>{t('adminPinLabel')}:</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('adminPinPlaceholder')}
                    value={pin}
                    onChangeText={(val) => setPin(val.replace(/[^0-9]/g, '').slice(0, 4))}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                  />
                  <Text style={styles.pinInfo}>{t('adminPinInfo')}</Text>
                </View>
              )}
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Check color="#fff" size={20} />
                <Text style={styles.saveBtnText}>{t('saveProfile')}</Text>
              </TouchableOpacity>
              {Platform.OS !== 'web' && showDatePicker && (
                <DateTimePicker value={new Date()} mode="date" display="default" onChange={handleDateChange} />
              )}
              {Platform.OS === 'web' && showDatePicker && (
                <View style={styles.webDateBox}>
                   <Text style={{fontSize: 12, color: '#6B7280', marginBottom: 5}}>Lütfen tarihi GG.AA.YYYY formatında elle yazınız:</Text>
                   <TextInput 
                     style={styles.input} 
                     placeholder="Örn: 15.05.1990" 
                     value={birthdate} 
                     onChangeText={setBirthdate} 
                     autoFocus
                   />
                   <TouchableOpacity style={styles.miniOkBtn} onPress={() => setShowDatePicker(false)}>
                     <Text style={{color: '#fff', fontWeight: 'bold'}}>Tamam</Text>
                   </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  headerArea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 20, elevation: 2 },
  mainTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  subTitle: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  mainAddBtn: { backgroundColor: '#059669', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  card: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, alignItems: 'center', elevation: 2 },
  avatarCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarEmoji: { fontSize: 30 },
  cardContent: { flex: 1 },
  nameText: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  tagsRow: { flexDirection: 'row', marginTop: 6, flexWrap: 'wrap' },
  tagText: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginRight: 6 },
  actionBtn: { padding: 8, marginLeft: 2 },
  emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 40, fontSize: 15 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  formBox: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  formTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  label: { fontSize: 14, fontWeight: 'bold', color: '#4B5563', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, height: 46, marginBottom: 5 },
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
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  seeAllBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginRight: 4 },
  seeAllBtnActive: { backgroundColor: '#FEF3C7' },
  seeAllBtnText: { fontSize: 18 },
  notifyTargetBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginRight: 4, borderWidth: 1, borderColor: '#A7F3D0' },
  notifyTargetBtnActive: { backgroundColor: '#059669', borderColor: '#059669' },
  notifyTargetBtnDisabled: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  deviceNotifText: { marginTop: 6, fontSize: 12, color: '#059669', fontWeight: '600' },
  permissionRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  permissionLabel: { fontSize: 14, fontWeight: 'bold', color: '#374151' },
  permissionDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  toggleSwitch: { width: 50, height: 28, borderRadius: 14, backgroundColor: '#D1D5DB', padding: 3, justifyContent: 'center' },
  toggleSwitchOn: { backgroundColor: '#059669' },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  toggleKnobOn: { alignSelf: 'flex-end' },

  pinBox: { backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: '#FDE68A' },
  pinInfo: { fontSize: 11, color: '#92400E', fontStyle: 'italic', marginTop: -10, marginBottom: 10 },
  webDateBox: { backgroundColor: '#F3F4F6', padding: 10, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#D1D5DB' },
  miniOkBtn: { backgroundColor: '#059669', padding: 8, borderRadius: 6, alignItems: 'center', marginTop: 5 },
  colorCircle: { width: 34, height: 34, borderRadius: 17, marginRight: 10, marginBottom: 10, borderWidth: 3, borderColor: 'transparent' },
  colorCircleActive: { borderColor: '#111827', transform: [{ scale: 1.1 }] },
});
