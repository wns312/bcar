interface IAccount {
  index: number
  id: string
  pw: string
  region: string
  isTestAccount: boolean
  isErrorOccured: boolean
  logStreamUrl: string
  errorContent: string
}

export class Account {
  constructor(data: IAccount){
    Object.assign(this, data)
  }

  index!: number
  id!: string
  pw!: string
  region!: string
  isTestAccount!: boolean
  isErrorOccured!: boolean
  logStreamUrl!: string
  errorContent!: string

}
