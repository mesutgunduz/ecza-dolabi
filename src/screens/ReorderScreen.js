import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Platform
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMeds, editMed } from '../utils/storage';
import { AlertCircle, ShoppingCart, Plus } from 'lucide-react-native';

const REORDER_THRESHOLD = 5;

export default function ReorderScreen() {
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reorderList, setReorderList] = useState([]);

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
    if (Platform.OS === 'web') {
      const message = `${med.name} (kalan: ${med.quantity} ${med.unit})`;
      alert(`Listenize eklendi:\n${message}\n\nDevam etmek için manuel not alınız.`);
    } else {
      Alert.alert(
        'Alışveriş Listesine Eklendi',
        `${med.name}\nKalan: ${med.quantity} ${med.unit}`,
        [{ text: 'Tamam', style: 'default' }]
      );
    }
  };

  const handleIncreaseTemp = (medId) => {
    const med = reorderList.find(m => m.id === medId);
    if (!med) return;

    setReorderList(prev => {
      const updated = [...prev];
      const idx = updated.findIndex(m => m.id === medId);
      if (idx >= 0) {
        updated[idx] = {
          ...updated[idx],
          quantity: (parseFloat(updated[idx].quantity || 0) + 1).toString()
        };
      }
      return updated;
    });
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#059669" /></View>;
  }

  const allMeds = meds.filter(m => m.isActive !== false);
  const outOfStock = allMeds.filter(m => parseFloat(m.quantity || 0) === 0);

  return (
    <View style={styles.container}>
      {reorderList.length === 0 && outOfStock.length === 0 ? (
        <View style={styles.emptyBox}>
          <ShoppingCart color="#059669" size={64} />
          <Text style={styles.emptyTitle}>Tüm ilaçlar yeterli miktarda</Text>
          <Text style={styles.emptyText}>Stok (5 birim altında) ilaç olmadığında, burada görüntülenecektir.</Text>
        </View>
      ) : (
        <FlatList
          data={reorderList}
          keyExtractor={item => item.id}
          ListHeaderComponent={
            <>
              {outOfStock.length > 0 && (
                <View style={styles.alertPanel}>
                  <AlertCircle color="#fff" size={20} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.alertTitle}>TÜKENMİŞ İLAÇLAR</Text>
                    <Text style={styles.alertCount}>{outOfStock.length} ilaç sıfırda</Text>
                  </View>
                </View>
              )}

              {reorderList.length > 0 && (
                <View style={styles.headerSection}>
                  <Text style={styles.sectionTitle}>YENİLENMESİ GEREKEN İLAÇLAR</Text>
                  <Text style={styles.sectionSubtitle}>{reorderList.length} ilaç (5 birimden az)</Text>
                </View>
              )}
            </>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
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

              <View style={styles.actions}>
                <TouchableOpacity style={styles.addBtn} onPress={() => handleAddToCart(item)}>
                  <Plus color="#fff" size={20} />
                  <Text style={styles.addBtnText}>Alışverişe Ekle</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListFooterComponent={
            reorderList.length > 0 ? (
              <View style={styles.footerHint}>
                <Text style={styles.footerHintText}>
                  💡 İpucu: Alışverişe Ekle butonuyla hızlı erişim sağlayabilirsiniz. Eczanede bu listeyi açıp sırasıyla kontrol edebilirsiniz.
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 20, flexGrow: 1 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginTop: 16 },
  emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 8 },
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
  actions: { flexDirection: 'row', gap: 8 },
  addBtn: { flex: 1, backgroundColor: '#059669', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12, marginLeft: 6 },
  footerHint: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, marginTop: 10 },
  footerHintText: { fontSize: 12, color: '#059669', fontWeight: '600' }
});
