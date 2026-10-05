export enum UserWalletTransactionType {
  FUNDING = 'FUNDING',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  VTU_PURCHASE = 'VTU_PURCHASE',
  VTU_REFUND = 'VTU_REFUND',
}

export enum VtuProductType {
  AIRTIME = 'AIRTIME',
  DATA = 'DATA',
  ELECTRICITY = 'ELECTRICITY',
  CABLE_TV = 'CABLE_TV',
}

export enum VtuOrderStatus {
  PENDING = 'PENDING',
  SUCCESSFUL = 'SUCCESSFUL',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum NetworkProvider {
  MTN = 'MTN',
  AIRTEL = 'AIRTEL',
  GLO = 'GLO',
  NINE_MOBILE = 'NINE_MOBILE',
}
