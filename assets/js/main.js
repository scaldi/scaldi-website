$(function () {
    var headerShow = function () {
        var y = $(this).scrollTop();

        if (y > 10) {
            $('.navbar-fixed-top').addClass("with-shadow");
            $('.navbar-fixed-top .navbar-nav .active').removeClass("top-rounded");
            $('.header-logo').fadeIn(300);
            $('.header-description').fadeIn(300);
        } else {
            $('.navbar-fixed-top').removeClass("with-shadow");
            $('.navbar-fixed-top .navbar-nav .active').addClass("top-rounded");
            $('.header-logo').fadeOut(100);
            $('.header-description').fadeOut(100);
        }
    }

    $(document).scroll(headerShow)
    $(document).resize(headerShow)
})