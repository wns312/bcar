interface IAccount {
  index: number
  id: string
  pw: string
  region: string
  totalAmount: number
  bongoPorterAmount: number
  importedAmount: number
  largeTruckAmount: number
  domesticAmount: number
}

export class Account {
  constructor(data: IAccount){
    Object.assign(this, data)
  }

  index!: number
  id!: string
  pw!: string
  region!: string
  totalAmount!: number
  bongoPorterAmount!: number
  importedAmount!: number
  largeTruckAmount!: number
  domesticAmount!: number
}
