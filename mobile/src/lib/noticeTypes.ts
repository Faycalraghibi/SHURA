export interface SystemNotice {
  title: string;
  body?: string;
  tone?: 'system' | 'gold' | 'danger' | 'success';
}
