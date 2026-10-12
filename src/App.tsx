import { BrowserRouter } from "react-router"
import BankrollProvider from "./shared/state/BankrollProvider"
import SessionProvider from "./shared/state/SessionProvider"
import Casino from "./app/Casino"

export default function App() {
  return (
    <BankrollProvider>
      <SessionProvider>
        <BrowserRouter>
          <Casino />
        </BrowserRouter>
      </SessionProvider>
    </BankrollProvider>
  )
}
