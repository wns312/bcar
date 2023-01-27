interface IAccount {
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

  id!: string
  pw!: string
  region!: string
  isTestAccount!: boolean
  isErrorOccured!: boolean
  logStreamUrl!: string
  errorContent!: string

}
