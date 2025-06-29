// For more information see https://aka.ms/fsharp-console-apps

let add x y = x + y
let multiply x y = x * y

// 型エラーのテスト
let typeError: string = 123 // エラー: int を string に代入

let main() =
    let result = add 5 3
    printfn "Hello from F#"
    printfn "5 + 3 = %d" result
    0

main()
