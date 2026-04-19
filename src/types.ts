export interface House {
  id: string;
  name: string;
  location: string;
  createdAt: any;
}

export interface Plan {
  id: string;
  houseId: string;
  name: string;
  duration: string;
  price: number;
  createdAt: any;
}

export interface Voucher {
  id: string;
  code: string;
  houseId: string;
  planId: string;
  status: 'unused' | 'used' | 'expired';
  transactionId?: string;
  customerEmail?: string;
  assignedAt?: any;
  createdAt: any;
}

export interface Transaction {
  id: string;
  houseId: string;
  planId: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  reference: string;
  customerEmail: string;
  source?: string;
  createdAt: any;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: any;
}
