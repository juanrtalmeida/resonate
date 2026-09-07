Pod::Spec.new do |s|
  s.name           = 'StoryShare'
  s.version        = '0.1.0'
  s.summary        = 'Instagram Stories share for Resonate'
  s.license        = 'MIT'
  s.author         = ''
  s.homepage       = 'https://github.com/'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = 'ios/**/*.{h,m,mm,swift,hpp,cpp}'
end
