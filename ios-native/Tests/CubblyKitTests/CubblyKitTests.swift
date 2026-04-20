import XCTest
@testable import CubblyKit

final class CubblyKitTests: XCTestCase {
    func testVersion() {
        XCTAssertEqual(CubblyKit.version, "0.1.0")
    }
}
