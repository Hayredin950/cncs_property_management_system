import { describe, it, expect } from 'vitest';
import { isPrivilegedViewer, sanitizeItem } from './filterItemFields.js';

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

  it('strips the bundle and history relations the SRS 3.4 table implies', () => {
    // `parentItemId` is the inverse edge of `accessories` — the same relation, so
    // publishing it would hand out a sibling item's id while hiding the list.
    // Edit history is ❌ for the public *and* the owner, and F7.3 allows the
    // public one sentence about a disposed item and "nothing else".
    const result = sanitizeItem(
      {
        ...mockItem,
        parentItemId: 'item-uuid-parent',
        editLogs: [{ id: 'log-1', fieldChanged: 'room' }],
        requests: [{ id: 'req-1', type: 'TRANSFER' }],
        disposalReason: 'Beyond repair',
        disposedAt: new Date(),
      },
      null
    );

    expect(result.parentItemId).toBeUndefined();
    expect(result.editLogs).toBeUndefined();
    expect(result.requests).toBeUndefined();
    expect(result.disposalReason).toBeUndefined();
    expect(result.disposedAt).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('Beyond repair');
  });

  it('keeps the fields SRS 3.4 does grant the public, including the photo', () => {
    const result = sanitizeItem(mockItem, null);

    expect(result).toMatchObject({
      tagId: 'CNCS-LAB-001',
      name: 'Microscope B204',
      department: 'Biology',
      building: 'Block 4',
      floor: '2nd',
      room: 'Room 205',
      condition: 'GOOD',
      photoUrl: 'https://example.com/photo.jpg',
    });
  });
});

describe('isPrivilegedViewer', () => {
  // The same predicate gates the disposed-tag 410 in GET /items/:tagId: F7.2
  // keeps a disposed item queryable for staff, F7.3 hides it from the public.
  it('is true for the two roles SRS 3.4 grants every field to', () => {
    expect(isPrivilegedViewer({ id: 'admin-1', role: 'ADMIN' })).toBe(true);
    expect(isPrivilegedViewer({ id: 'staff-1', role: 'STAFF' })).toBe(true);
  });

  it('is false for a guest, with no exception for a malformed viewer', () => {
    expect(isPrivilegedViewer(null)).toBe(false);
    expect(isPrivilegedViewer(undefined)).toBe(false);
    expect(isPrivilegedViewer()).toBe(false);
    // A role that is not in the enum is not a free pass.
    expect(isPrivilegedViewer({ id: 'x', role: 'VIEWER' } as never)).toBe(false);
  });
});