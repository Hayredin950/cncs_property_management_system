import { describe, it, expect } from 'vitest';
import { sanitizeItem } from './filterItemFields.js';

describe('Server-Side Field-Filtering Helper (sanitizeItem)', () => {
  const mockItem = {
    id: 'item-uuid-1',
    tagId: 'CNCS-LAB-001',
    name: 'Microscope B204',
    department: 'Biology',
    building: 'Block 4',
    floor: '2nd',
    room: 'Room 205',
    condition: 'GOOD',
    status: 'ACTIVE',
    photoUrl: 'https://example.com/photo.jpg',
    registeredAt: new Date(),
    // Sensitive fields that MUST be stripped from public view:
    purchaseCost: 4500.0,
    currentValue: 3800.0,
    brand: 'Olympus',
    model: 'CX23',
    serialNumber: 'SN-998822',
    notes: 'Stored in cabinet A',
    accessories: [{ id: 'acc-1', name: 'Lens cover' }],
    ownerId: 'staff-user-1',
    owner: {
      id: 'staff-user-1',
      fullName: 'Abebe Kebede',
      email: 'abebe@cncs.aau.edu.et',
    },
  };

  it('strips all restricted fields when request is unauthenticated (public)', () => {
    const result = sanitizeItem(mockItem, null);

    // Public fields remain
    expect(result.tagId).toBe('CNCS-LAB-001');
    expect(result.name).toBe('Microscope B204');
    expect(result.condition).toBe('GOOD');

    // Restricted fields must be completely undefined
    expect(result.purchaseCost).toBeUndefined();
    expect(result.currentValue).toBeUndefined();
    expect(result.brand).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(result.serialNumber).toBeUndefined();
    expect(result.notes).toBeUndefined();
    expect(result.accessories).toBeUndefined();
    expect(result.ownerId).toBeUndefined();
    expect(result.owner).toBeUndefined();
  });

  it('keeps all fields when requester is an ADMIN', () => {
    const adminUser = { id: 'admin-1', role: 'ADMIN' as const };
    const result = sanitizeItem(mockItem, adminUser);

    expect(result.purchaseCost).toBe(4500.0);
    expect(result.serialNumber).toBe('SN-998822');
    expect(result.ownerId).toBe('staff-user-1');
  });

  it('keeps all fields when requester is STAFF', () => {
    const staffUser = { id: 'staff-2', role: 'STAFF' as const };
    const result = sanitizeItem(mockItem, staffUser);

    expect(result.purchaseCost).toBe(4500.0);
    expect(result.brand).toBe('Olympus');
  });

  it('keeps all fields when requester is the assigned owner (custodian)', () => {
    // User whose ID matches the item ownerId exactly
    const ownerUser = { id: 'staff-user-1', role: 'STAFF' as const };
    const result = sanitizeItem(mockItem, ownerUser);

    expect(result.purchaseCost).toBe(4500.0);
    expect(result.serialNumber).toBe('SN-998822');
    expect(result.notes).toBe('Stored in cabinet A');
  });
});