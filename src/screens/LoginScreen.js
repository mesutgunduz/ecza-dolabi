import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { ShieldCheck, Cloud } from 'lucide-react-native';

export default function LoginScreen({ onLogin }) {
  const [code, setCode] = useState('');

  const handleLogin = () => {
    if (code.trim().length < 4) {
      alert('Aile kodunuz en az 4 karakter olmalıdır.');
      return;
    }
    onLogin(code.trim().toUpperCase());
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
        <Text style={styles.desc}>Cihazlarınızı birbirine bağlamak için kendinize ait özel bir aile şifresi belirleyin. Diğer cihazlarda da aynı kodu girdiğinizde ecza dolabınız ortak olacaktır.</Text>

        <TextInput
          style={styles.input}
          placeholder="Örn: YILMAZAILE123"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
        />

        <TouchableOpacity style={styles.btn} onPress={handleLogin}>
          <ShieldCheck color="#fff" size={20} />
          <Text style={styles.btnText}>Dolaba Bağlan</Text>
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
