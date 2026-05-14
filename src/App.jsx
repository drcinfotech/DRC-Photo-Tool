import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import BackgroundRemover from './pages/BackgroundRemover'
// import TransparencyEditor from './pages/TransparencyEditor'
import ImageResizer from './pages/ImageResizer'
import ImageCompressor from './pages/ImageCompressor'
import ImageCropper from './pages/ImageCropper'
import FormatConverter from './pages/FormatConverter'
import Base64Converter from './pages/Base64Converter'
// import FaceMatch from './pages/FaceMatch'
import AIImageGenerator from './pages/AIImageGenerator'
import MultiViewGenerator from './pages/MultiViewGenerator'
import Rotate360Generator from './pages/Rotate360Generator'
import ImageToGif from './pages/ImageToGif'
import Pricing from './pages/Pricing'
import './App.css'

function App() {
  return (
    <>
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/background-remover" element={<BackgroundRemover />} />
          {/* <Route path="/transparency-editor" element={<TransparencyEditor />} /> */}
          <Route path="/image-resizer" element={<ImageResizer />} />
          <Route path="/image-compressor" element={<ImageCompressor />} />
          <Route path="/image-cropper" element={<ImageCropper />} />
          <Route path="/format-converter" element={<FormatConverter />} />
          <Route path="/base64-converter" element={<Base64Converter />} />
          {/* <Route path="/face-match" element={<FaceMatch />} /> */}
          <Route path="/ai-image-generator" element={<AIImageGenerator />} />
          <Route path="/multi-view" element={<MultiViewGenerator />} />
          <Route path="/rotate-360" element={<Rotate360Generator />} />
          <Route path="/image-to-gif" element={<ImageToGif />} />
          <Route path="/pricing" element={<Pricing />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}

export default App
