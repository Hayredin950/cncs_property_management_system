import { describe, it, expect } from 'vitest';
import { isAuthenticatedViewer, seesFullItemDetail, sanitizeItem } from './filterItemFields.js';

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

  it('keeps all fields when requester is a PROPERTY_OFFICER', () => {
    const officer = { id: 'officer-1', role: 'PROPERTY_OFFICER' as const };
    const result = sanitizeItem(mockItem, officer);

    expect(result.purchaseCost).toBe(4500.0);
    expect(result.serialNumber).toBe('SN-998822');
    expect(result.ownerId).toBe('staff-user-1');
  });

  it('keeps all fields when requester is an AUDITOR (read-only, but full)', () => {
    const auditor = { id: 'auditor-1', role: 'AUDITOR' as const };
    const result = sanitizeItem(mockItem, auditor);

    expect(result.purchaseCost).toBe(4500.0);
    expect(result.serialNumber).toBe('SN-998822');
  });

  it('strips everything for a SYSTEM_ADMIN — it is an account role, not an asset role', () => {
    const sys = { id: 'sys-1', role: 'SYSTEM_ADMIN' as const };
    const result = sanitizeItem(mockItem, sys);

    expect(result.tagId).toBe('CNCS-LAB-001');
    expect(result.purchaseCost).toBeUndefined();
    expect(result.serialNumber).toBeUndefined();
    expect(result.owner).toBeUndefined();
  });

  it('gives a STAFF member only their own items — someone else\u2019s is stripped', () => {
    const otherStaff = { id: 'staff-2', role: 'STAFF' as const };
    const result = sanitizeItem(mockItem, otherStaff);

    expect(result.tagId).toBe('CNCS-LAB-001');
    expect(result.purchaseCost).toBeUndefined();
    expect(result.brand).toBeUndefined();
    expect(result.serialNumber).toBeUndefined();
  });

  it('keeps all fields when requester is the assigned owner (custodian)', () => {
    // User whose ID matches the item ownerId exactly
    const ownerUser = { id: 'staff-user-1', role: 'STAFF' as const };
    const result = sanitizeItem(mockItem, ownerUser);

    expect(result.purchaseCost).toBe(4500.0);
    expect(result.serialNumber).toBe('SN-998822');
    expect(result.notes).toBe('Stored in cabinet A');
  });

  it('gives a DEPARTMENT_HEAD full detail for their own department only', () => {
    const ownHead = { id: 'head-1', role: 'DEPARTMENT_HEAD' as const, departmentId: 'dept-bio' };
    const inDepartment = sanitizeItem({ ...mockItem, departmentId: 'dept-bio' }, ownHead);
    expect(inDepartment.purchaseCost).toBe(4500.0);

    const otherDepartment = sanitizeItem({ ...mockItem, departmentId: 'dept-cs' }, ownHead);
    expect(otherDepartment.purchaseCost).toBeUndefined();
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

describe('seesFullItemDetail', () => {
  it('is true for the college-wide roles', () => {
    expect(seesFullItemDetail({ id: 'o', role: 'PROPERTY_OFFICER' })).toBe(true);
    expect(seesFullItemDetail({ id: 'a', role: 'AUDITOR' })).toBe(true);
  });

  it('is false for a guest, with no exception for a malformed viewer', () => {
    expect(seesFullItemDetail(null)).toBe(false);
    expect(seesFullItemDetail(undefined)).toBe(false);
    // A role that is not in the enum is not a free pass.
    expect(seesFullItemDetail({ id: 'x', role: 'VIEWER' } as never)).toBe(false);
  });

  it('is false for a SYSTEM_ADMIN and for a STAFF member who is not the custodian', () => {
    expect(seesFullItemDetail({ id: 's', role: 'SYSTEM_ADMIN' })).toBe(false);
    expect(seesFullItemDetail({ id: 'staff-2', role: 'STAFF' }, { ownerId: 'staff-1' })).toBe(false);
  });

  it('is true for a STAFF member who holds the item, via ownerId or the holder fields', () => {
    expect(seesFullItemDetail({ id: 'staff-1', role: 'STAFF' }, { ownerId: 'staff-1' })).toBe(true);
    expect(
      seesFullItemDetail(
        { id: 'staff-1', role: 'STAFF' },
        { holderType: 'STAFF', holderId: 'staff-1' },
      ),
    ).toBe(true);
  });
});

describe('isAuthenticatedViewer', () => {
  // Gates the disposed-tag 410 in GET /items/:tagId: F7.2 keeps a disposed item
  // queryable for any signed-in user, F7.3 hides it from the public.
  it('is true whenever a user is present, whatever the role', () => {
    expect(isAuthenticatedViewer({ id: 's', role: 'SYSTEM_ADMIN' })).toBe(true);
    expect(isAuthenticatedViewer({ id: 'x', role: 'STAFF' })).toBe(true);
  });

  it('is false for a guest', () => {
    expect(isAuthenticatedViewer(null)).toBe(false);
    expect(isAuthenticatedViewer(undefined)).toBe(false);
    expect(isAuthenticatedViewer()).toBe(false);
  });
});
