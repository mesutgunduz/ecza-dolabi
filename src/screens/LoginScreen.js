import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { ShieldCheck, Cloud } from 'lucide-react-native';
import { useTranslation } from '../i18n/LanguageContext';

export default function LoginScreen({ onAuth }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [mode, setMode] = useState('join');
  const [showAdminPin, setShowAdminPin] = useState(false);

  const handleSubmit = async () => {
    if (code.trim().length < 4) {
      Alert.alert(t('error'), t('errCodeShort'));
      return;
    }

    if (password.trim().length < 4) {
      Alert.alert(t('error'), t('errPasswordShort'));
      return;
    }

    const result = await onAuth({
      mode,
      code: code.trim().toUpperCase(),
      password: password.trim(),
      adminPin: showAdminPin ? adminPin.trim() : '',
    });

    if (result?.ok) return;

    if (result?.reason === 'code-exists') {
      Alert.alert(t('error'), t('errCodeExists'));
      return;
    }

    if (result?.reason === 'wrong-password') {
      Alert.alert(t('error'), t('errWrongPassword'));
      return;
    }

    if (result?.reason === 'not-found') {
      Alert.alert(t('error'), t('errNotFound'));
      return;
    }

    if (result?.reason === 'admin-pin-required') {
      setShowAdminPin(true);
      Alert.alert(t('error'), t('errAdminPinRequired'));
      return;
    }

    if (result?.reason === 'admin-pin-invalid') {
      setShowAdminPin(true);
      Alert.alert(t('error'), t('errAdminPinInvalid'));
      return;
    }

    if (result?.reason === 'admin-pin-not-configured') {
      setShowAdminPin(true);
      Alert.alert(t('error'), t('errAdminPinNotConfigured'));
      return;
    }

    Alert.alert(t('error'), t('errGeneric'));
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.iconBox}>
        <Cloud color="#059669" size={80} />
      </View>

      <Text style={styles.title}>{t('loginTitle')}</Text>
      <Text style={styles.subtitle}>{t('loginSubtitle')}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>{t('familyCode')}</Text>
        <Text style={styles.desc}>{t('familyCodeDesc')}</Text>

        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'create' && styles.modeBtnActive]}
            onPress={() => { setMode('create'); setShowAdminPin(false); setAdminPin(''); }}
          >
            <Text style={[styles.modeText, mode === 'create' && styles.modeTextActive]}>{t('newFamily')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'join' && styles.modeBtnActive]}
            onPress={() => setMode('join')}
          >
            <Text style={[styles.modeText, mode === 'join' && styles.modeTextActive]}>{t('loginBtn')}</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Örn: YILMAZAILE123"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
        />

        <TextInput
          style={[styles.input, { letterSpacing: 0 }]}
          placeholder={t('familyPassword')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        {mode === 'join' && showAdminPin && (
          <>
            <TextInput
              style={[styles.input, { letterSpacing: 3 }]}
              placeholder={t('adminPin')}
              value={adminPin}
              onChangeText={(val) => setAdminPin(val.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="numeric"
              secureTextEntry
            />
            <Text style={styles.pinHint}>{t('adminPinHint')}</Text>
          </>
        )}

        <TouchableOpacity style={styles.btn} onPress={handleSubmit}>
          <ShieldCheck color="#fff" size={20} />
          <Text style={styles.btnText}>{mode === 'create' ? t('createFamily') : t('loginFamily')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', padding: 20
  },
  iconBox: {
    width: 120, height: 120, backgroundColor: '#ECFDF5', borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5
  },
  title: {
    fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 5
  },
  subtitle: {
    fontSize: 16, color: '#059669', fontWeight: 'bold', marginBottom: 40
  },
  card: {
    backgroundColor: '#fff', width: '100%', padding: 20, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 3
  },
  label: {
    fontSize: 16, fontWeight: 'bold', color: '#374151', marginBottom: 8
  },
  desc: {
    fontSize: 13, color: '#6B7280', marginBottom: 20, lineHeight: 18
  },
  modeRow: {
    flexDirection: 'row', marginBottom: 12, gap: 8
  },
  modeBtn: {
    flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: '#F9FAFB'
  },
  modeBtnActive: {
    borderColor: '#059669', backgroundColor: '#ECFDF5'
  },
  modeText: {
    color: '#4B5563', fontWeight: '600'
  },
  modeTextActive: {
    color: '#047857', fontWeight: 'bold'
  },
  pinHint: {
    marginTop: -10,
    marginBottom: 14,
    fontSize: 12,
    color: '#6B7280',
  },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 15, fontSize: 16, marginBottom: 20, fontWeight: 'bold', color: '#111827', textAlign: 'center', letterSpacing: 2
  },
  btn: {
    backgroundColor: '#059669', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, borderRadius: 8
  },
  btnText: {
    color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 10
  }
});
