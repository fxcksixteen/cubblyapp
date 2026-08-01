#pragma once
#ifdef _WIN32

#include <winrt/base.h>

#include <mutex>

namespace cubbly {

// C++/WinRT projection calls need the calling thread's COM apartment
// initialized before any type touches an activation factory. Safe to call
// from multiple translation units / repeatedly on the same thread.
inline void EnsureApartmentInitialized() {
  static std::once_flag flag;
  std::call_once(flag, []() {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
  });
}

}  // namespace cubbly

#endif  // _WIN32
