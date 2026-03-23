# Mobile Profitability Patch

Copy-paste-ready kod för handymate-mobile.

---

## 1. lib/api.ts — Lägg till denna funktion

```typescript
// --- PROFITABILITY ---

export interface ProfitabilityData {
  status: 'on_track' | 'at_risk' | 'over_budget'
  cost_percent: number
  margin: number
  margin_percent: number
  message: string
}

export async function getProfitability(projectId: string): Promise<ProfitabilityData | null> {
  try {
    const token = await getToken()
    const res = await fetch(
      `${API_BASE}/api/projects/${projectId}/profitability/mobile`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
```

---

## 2. Projects-listan — Färgad dot per projekt

### Skapa komponent: components/ProfitabilityDot.tsx

```tsx
import React, { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { getProfitability, ProfitabilityData } from '../lib/api'

interface Props {
  projectId: string
}

export function ProfitabilityDot({ projectId }: Props) {
  const [status, setStatus] = useState<ProfitabilityData['status'] | null>(null)

  useEffect(() => {
    getProfitability(projectId).then(data => {
      if (data) setStatus(data.status)
    })
  }, [projectId])

  if (!status) return null

  const color =
    status === 'over_budget' ? '#EF4444' :
    status === 'at_risk' ? '#F59E0B' :
    '#0F766E'

  return <View style={[styles.dot, { backgroundColor: color }]} />
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
  },
})
```

### I projektkort-raden (projects.tsx eller ProjectCard):

Hitta raden där projektnamnet visas, t.ex.:
```tsx
<Text style={styles.projectName}>{project.name}</Text>
```

Ändra till:
```tsx
<View style={{ flexDirection: 'row', alignItems: 'center' }}>
  <Text style={styles.projectName}>{project.name}</Text>
  <ProfitabilityDot projectId={project.project_id} />
</View>
```

Import:
```tsx
import { ProfitabilityDot } from '../components/ProfitabilityDot'
```

---

## 3. Projekt-detaljvy — Lönsamhetssektion

### Skapa komponent: components/ProfitabilityCard.tsx

```tsx
import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native'
import { getProfitability, ProfitabilityData } from '../lib/api'

interface Props {
  projectId: string
}

export function ProfitabilityCard({ projectId }: Props) {
  const [data, setData] = useState<ProfitabilityData | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    getProfitability(projectId).then(setData)
  }, [projectId])

  if (!data) return null

  const barColor =
    data.status === 'over_budget' ? '#EF4444' :
    data.status === 'at_risk' ? '#F59E0B' :
    '#0F766E'

  const statusEmoji =
    data.status === 'over_budget' ? '🔴' :
    data.status === 'at_risk' ? '⚠️' :
    '✅'

  const statusLabel =
    data.status === 'over_budget' ? 'Över budget' :
    data.status === 'at_risk' ? 'Håll koll' :
    'Inom budget'

  return (
    <>
      <TouchableOpacity
        style={styles.card}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        <View style={styles.header}>
          <Text style={styles.title}>💰 Lönsamhet</Text>
          <Text style={styles.statusBadge}>
            {statusEmoji} {statusLabel}
          </Text>
        </View>

        <Text style={styles.message}>{data.message}</Text>

        {/* Progress bar */}
        <View style={styles.barBg}>
          <View
            style={[
              styles.barFill,
              {
                backgroundColor: barColor,
                width: `${Math.min(data.cost_percent, 100)}%`,
              },
            ]}
          />
        </View>

        <Text style={styles.hint}>Tryck för detaljer</Text>
      </TouchableOpacity>

      {/* Detalj-modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setShowModal(false)}
        >
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              💰 Lönsamhet — Detaljer
            </Text>

            <View style={styles.row}>
              <Text style={styles.label}>Budget använt</Text>
              <Text style={styles.value}>{data.cost_percent}%</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Marginal</Text>
              <Text style={[
                styles.value,
                { color: data.margin >= 0 ? '#0F766E' : '#EF4444' }
              ]}>
                {data.margin >= 0 ? '+' : ''}
                {new Intl.NumberFormat('sv-SE').format(data.margin)} kr
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Marginalprocent</Text>
              <Text style={styles.value}>
                {data.margin_percent}%
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Status</Text>
              <Text style={styles.value}>
                {statusEmoji} {statusLabel}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowModal(false)}
            >
              <Text style={styles.closeBtnText}>Stäng</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  statusBadge: {
    fontSize: 12,
    color: '#64748B',
  },
  message: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  barBg: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  hint: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'right',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  label: {
    fontSize: 14,
    color: '#64748B',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  closeBtn: {
    backgroundColor: '#0F766E',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
})
```

### I projekt-detaljvyn — placera ovanför check-in-knappen:

```tsx
import { ProfitabilityCard } from '../components/ProfitabilityCard'

// I renderingen, ovanför check-in:
<ProfitabilityCard projectId={project.project_id} />
```

---

## Sammanfattning

| Fil | Åtgärd |
|-----|--------|
| `lib/api.ts` | Lägg till `getProfitability()` + `ProfitabilityData` interface |
| `components/ProfitabilityDot.tsx` | NY — färgad dot för projektlistan |
| `components/ProfitabilityCard.tsx` | NY — lönsamhetskort med modal |
| Projektlista | Importera `ProfitabilityDot`, lägg bredvid projektnamn |
| Projekt-detalj | Importera `ProfitabilityCard`, lägg ovanför check-in |
