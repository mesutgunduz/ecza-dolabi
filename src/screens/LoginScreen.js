import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { ShieldCheck, Cloud } from 'lucide-react-native';

export default function LoginScreen({ onAuth }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [mode, setMode] = useState('join');
  const [showAdminPin, setShowAdminPin] = useState(false);

  const handleSubmit = async () => {
    if (code.trim().length < 4) {
      Alert.alert('Hata', 'Aile kodunuz en az 4 karakter olmalıdır.');
      return;
    }

    if (password.trim().length < 4) {
      Alert.alert('Hata', 'Aile şifresi en az 4 karakter olmalıdır.');
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
      Alert.alert('Bu kod kullaniliyor', 'Bu aile kodu zaten var. Lutfen baska bir kod secin.');
      return;
    }

    if (result?.reason === 'wrong-password') {
      Alert.alert('Hatali sifre', 'Kod size aitse sifrenizle giris yapin.');
      return;
    }

    if (result?.reason === 'not-found') {
      Alert.alert('Aile bulunamadi', 'Bu kodla bir aile bulunamadi. Yeni aile olusturabilirsiniz.');
      return;
    }

    if (result?.reason === 'admin-pin-required') {
      setShowAdminPin(true);
      Alert.alert('Yonetici PIN gerekli', 'Bu ailede ilk sifre atamasi icin yonetici PIN girilmelidir.');
      return;
    }

    if (result?.reason === 'admin-pin-invalid') {
      setShowAdminPin(true);
      Alert.alert('Hatali PIN', 'Yonetici PIN dogrulanamadi.');
      return;
    }

    if (result?.reason === 'admin-pin-not-configured') {
      setShowAdminPin(true);
      Alert.alert('Yonetici PIN yok', 'Bu eski ailede yonetici PIN tanimli degil. Once ailede oturum acik bir cihazdan yonetici PIN belirleyin.');
      return;
    }

    Alert.alert('Hata', 'Islem tamamlanamadi. Lutfen tekrar deneyin.');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.iconBox}>
        <Cloud color="#059669" size={80} />
      </View>

      <Text style={styles.title}>Ecza Dolabım</Text>
      <Text style={styles.subtitle}>Bulut Senkronizasyonu Aktif</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Aile Bağlantı Kodu:</Text>
        <Text style={styles.desc}>Yeni aile olusturabilir veya mevcut aile kodu ve sifresiyle giris yapabilirsiniz.</Text>

        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'create' && styles.modeBtnActive]}
            onPress={() => {
              setMode('create');
              setShowAdminPin(false);
              setAdminPin('');
            }}
          >
            <Text style={[styles.modeText, mode === 'create' && styles.modeTextActive]}>Yeni Aile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'join' && styles.modeBtnActive]}
            onPress={() => setMode('join')}
          >
            <Text style={[styles.modeText, mode === 'join' && styles.modeTextActive]}>Giris Yap</Text>
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
          placeholder="Aile Sifresi"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        {mode === 'join' && showAdminPin && (
          <>
            <TextInput
              style={[styles.input, { letterSpacing: 3 }]}
              placeholder="Yonetici PIN (eski aile icin)"
              value={adminPin}
              onChangeText={(val) => setAdminPin(val.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="numeric"
              secureTextEntry
            />
            <Text style={styles.pinHint}>Bu alan sadece eski ailelerde ilk sifre atamasi icin gerekir.</Text>
          </>
        )}

        <TouchableOpacity style={styles.btn} onPress={handleSubmit}>
          <ShieldCheck color="#fff" size={20} />
          <Text style={styles.btnText}>{mode === 'create' ? 'Yeni Aile Olustur' : 'Dolaba Giris Yap'}</Text>
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
