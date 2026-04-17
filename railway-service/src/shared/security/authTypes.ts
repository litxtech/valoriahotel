export type AuthContext = {
  authUserId: string;
  hotelId: string;
  role: 'admin' | 'manager' | 'receptionist' | 'accountant';
};

