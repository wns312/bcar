interface IAccount {
  index: number
  id: string
  pw: string
  region: string
  uploadAmount: number
}

export class Account {
  constructor(data: IAccount){
    Object.assign(this, data)
  }

  index!: number
  id!: string
  pw!: string
  region!: string
  uploadAmount!: number
}
