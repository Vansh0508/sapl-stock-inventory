"use client"

import { Label, Slider } from "@heroui/react"

interface PercentageSliderProps {
  label?: string
  value: number
  onChange: (val: number) => void
  min?: number
  max?: number
  step?: number
  isDisabled?: boolean
  className?: string
}

const PercentageSlider = ({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  isDisabled = false,
  className = "w-full",
}: PercentageSliderProps) => {
  return (
    <Slider
      value={value}
      onChange={(val) => onChange(Array.isArray(val) ? val[0] : val)}
      minValue={min}
      maxValue={max}
      step={step}
      isDisabled={isDisabled}
      className={className}
    >
      {label && <Label>{label}</Label>}
      <Slider.Output />
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  )
}

export default PercentageSlider
