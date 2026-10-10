import { BrowserRouter } from "react-router"
import BankrollProvider from "./shared/BankrollProvider"
import SessionProvider from "./shared/SessionProvider"
import Casino from "./Casino"

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
