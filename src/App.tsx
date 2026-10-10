import { BrowserRouter } from "react-router"
import BankrollProvider from "./shared/BankrollProvider"
import Casino from "./Casino"

export default function App() {
  return (
    <BankrollProvider>
      <BrowserRouter>
        <Casino />
      </BrowserRouter>
    </BankrollProvider>
  )
}
