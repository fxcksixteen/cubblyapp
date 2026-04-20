import XCTest
@testable import Cubbly

final class SmokeTests: XCTestCase {
    func testAvatarInitials() {
        XCTAssertEqual(AvatarView.initials(from: "Anton Osika"), "AO")
        XCTAssertEqual(AvatarView.initials(from: "cubbly"), "C")
    }

    func testConfigPointsAtCloud() {
        XCTAssertEqual(CubblyConfig.supabaseURL.host, "rubalrtmsxmdrpcknprz.supabase.co")
        XCTAssertFalse(CubblyConfig.supabaseAnonKey.isEmpty)
    }
}
