// Delay를 간편하게 주기위한 용도
export async function delay(delay: number) {
  await new Promise((resolve, reject)=>{
    setTimeout(()=>{ resolve(null) }, delay)
  })
}
