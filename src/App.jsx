import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'
import Hero from './components/Hero.jsx'


function App() {

  return (
    <div className= " bg-gray-900 h-screen w-screen">
      <Hero />
    </div>
  )

}

export default App
