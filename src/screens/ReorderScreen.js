import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Platform, ScrollView
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMeds } from '../utils/storage';
import { AlertCircle, ShoppingCart, Plus, Trash2, Check } from 'lucide-react-native';

const REORDER_THRESHOLD = 5;

export default function ReorderScreen() {
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reorderList, setReorderList] = useState([]);
  const [cart, setCart] = useState([]);  // { id, name, form, unit, quantity }

  const loadData = async () => {
    try {
      setLoading(true);
      const m = await getMeds();
      setMeds(m);

      const needsReorder = m.filter(med => {
        const qty = parseFloat(med.quantity || 0);
        return med.isActive !== false && qty > 0 && qty < REORDER_THRESHOLD;
      });

      setReorderList(needsReorder);
    } catch (e) {
      console.error('Load reorder data failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleAddToCart = (med) => {
    setCart(prev => {
      if (prev.find(c => c.id === med.id)) return prev;
      return [...prev, { id: med.id, name: med.name, form: med.form, unit: med.unit, quantity: med.quantity }];
    });
  };

  const handleRemoveFromCart = (medId) => {
    setCart(prev => prev.filter(c => c.id !== medId));
  };

  const handleClearCart = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Tüm liste temizlensin mi?')) setCart([]);
    } else {
      Alert.alert('Listeyi Temizle', 'Tüm alışveriş listesi silinsin mi?', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Temizle', style: 'destructive', onPress: () => setCart([]) },
      ]);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#059669" /></View>;
  }

  const allMeds = meds.filter(m => m.isActive !== false);
  const outOfStock = allMeds.filter(m => parseFloat(m.quantity || 0) === 0);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 20 }}>

        {/* Sepetim */}
        <View style={styles.cartPanel}>
          <View style={styles.cartHeader}>
            <ShoppingCart color="#059669" size={18} />
            <Text style={styles.cartTitle}>Alışveriş Listem</Text>
            {cart.length > 0 && (
              <TouchableOpacity onPress={handleClearCart} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Temizle</Text>
              </TouchableOpacity>
            )}
          </View>
          {cart.length === 0 ? (
            <Text style={styles.cartEmpty}>Henüz ilaç eklemediniz. Aşağıdan ekleyin.</Text>
          ) : (
            cart.map(item => (
              <View key={item.id} style={styles.cartItem}>
                <Check color="#059669" size={14} />
                <Text style={styles.cartItemName}>{item.name}</Text>
                <Text style={styles.cartItemMeta}>Kalan: {item.quantity} {item.unit}</Text>
                <TouchableOpacity onPress={() => handleRemoveFromCart(item.id)} style={styles.cartRemoveBtn}>
                  <Trash2 color="#EF4444" size={14} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Tükenmiş Uyarısı */}
        {outOfStock.length > 0 && (
          <View style={styles.alertPanel}>
            <AlertCircle color="#fff" size={20} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.alertTitle}>TÜKENMİŞ İLAÇLAR</Text>
              <Text style={styles.alertCount}>{outOfStock.length} ilaç sıfırda</Text>
            </View>
          </View>
        )}

        {reorderList.length > 0 ? (
          <>
            <View style={styles.headerSection}>
              <Text style={styles.sectionTitle}>YENİLENMESİ GEREKEN İLAÇLAR</Text>
              <Text style={styles.sectionSubtitle}>{reorderList.length} ilaç (5 birimden az)</Text>
            </View>
            {reorderList.map(item => {
              const inCart = cart.find(c => c.id === item.id);
              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.medInfo}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.medName}>{item.name}</Text>
                      <Text style={styles.medMeta}>{item.form || 'Tablet'} • {item.unit}</Text>
                      <Text style={styles.mediStok}>Kalan Stok: {item.quantity} {item.unit}</Text>
                      {item.expiryDate && <Text style={styles.expiryText}>SKT: {item.expiryDate}</Text>}
                    </View>
                    <View style={styles.qtyBox}>
                      <Text style={styles.qtyText}>{item.quantity}</Text>
                      <Text style={styles.qtyLabel}>{item.unit}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.addBtn, inCart && styles.addBtnDone]}
                    onPress={() => inCart ? handleRemoveFromCart(item.id) : handleAddToCart(item)}
                  >
                    {inCart ? <Check color="#fff" size={16} /> : <Plus color="#fff" size={16} />}
                    <Text style={styles.addBtnText}>{inCart ? 'Listede ✓' : 'Listeye Ekle'}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        ) : reorderList.length === 0 && outOfStock.length === 0 ? (
          <View style={styles.emptyBox}>
            <ShoppingCart color="#059669" size={64} />
            <Text style={styles.emptyTitle}>Tüm ilaçlar yeterli miktarda</Text>
            <Text style={styles.emptyText}>Stok 5 birimin altına düşünce burada görüntülenecek.</Text>
          </View>
        ) : null}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyBox: { paddingTop: 60, alignItems: 'center', paddingHorizontal: 20 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginTop: 16 },
  emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 8 },
  cartPanel: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#D1FAE5' },
  cartHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cartTitle: { fontSize: 15, fontWeight: 'bold', color: '#059669', marginLeft: 8, flex: 1 },
  clearBtn: { backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  clearBtnText: { color: '#EF4444', fontSize: 11, fontWeight: '700' },
  cartEmpty: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
  cartItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  cartItemName: { flex: 1, fontSize: 13, fontWeight: '700', color: '#111827', marginLeft: 8 },
  cartItemMeta: { fontSize: 11, color: '#6B7280', marginRight: 8 },
  cartRemoveBtn: { padding: 4 },
  alertPanel: { backgroundColor: '#EF4444', borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center' },
  alertTitle: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  alertCount: { color: '#fee2e2', fontSize: 11, marginTop: 2 },
  headerSection: { marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#111827' },
  sectionSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#FCD34D' },
  medInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  medName: { fontSize: 15, fontWeight: 'bold', color: '#111827' },
  medMeta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  mediStok: { fontSize: 12, fontWeight: '700', color: '#EF4444', marginTop: 4 },
  expiryText: { fontSize: 10, color: '#9CA3AF', marginTop: 2, fontStyle: 'italic' },
  qtyBox: { backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', alignItems: 'center', minWidth: 60 },
  qtyText: { fontSize: 20, fontWeight: 'bold', color: '#B45309' },
  qtyLabel: { fontSize: 9, color: '#92400E', fontWeight: '700', marginTop: 2 },
  addBtn: { backgroundColor: '#059669', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8 },
  addBtnDone: { backgroundColor: '#6B7280' },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12, marginLeft: 6 },
});
