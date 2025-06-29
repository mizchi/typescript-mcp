// For more information see https://aka.ms/fsharp-console-apps
module Program

let add x y = x + y
let multiply x y = x * y

// 型エラーのテスト
let (_typeError: string) = 123 // エラー: int を string に代入

let main() =
    printfn "=== F# Calculator Demo ==="
    
    // 基本的な計算
    let addResult = Calculator.add 10 5
    let subResult = Calculator.subtract 10 5
    let mulResult = Calculator.multiply 10 5
    let divResult = Calculator.divide 10 5
    
    printfn "10 + 5 = %d" addResult
    printfn "10 - 5 = %d" subResult
    printfn "10 * 5 = %d" mulResult
    printfn "10 / 5 = %d" divResult
    
    // リストの合計
    let numbers = [1; 2; 3; 4; 5]
    let sum = Calculator.sumList numbers
    printfn "Sum of %A = %d" numbers sum
    
    // パターンマッチング
    printfn "10 is %s" (Calculator.describeNumber 10)
    printfn "-5 is %s" (Calculator.describeNumber -5)
    printfn "0 is %s" (Calculator.describeNumber 0)
    
    0

main() |> ignore
