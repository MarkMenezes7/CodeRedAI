export interface Emergency {
  id: string;
  title: string;
  status: 'active' | 'resolved' | 'pending';
  location?: string;
}
