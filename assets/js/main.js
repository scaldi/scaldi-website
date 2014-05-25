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

    var slagify = function (text) {
        return text.toLowerCase().replace(/[^\w ]+/g,'').replace(/ +/g,'-')
    }

    $("h2").each(function () {
        var me = $(this)
        var text = me.text()
        var slug = slagify(me.text())

        var html = me.append('<a id="' + slug + '" href="#" class="a-link"></a>').html()

//        me.attr('id', slug)

        me.mouseenter(function () {
            me.append('<a class="link-link" href="#' + slug + '"><span class="glyphicon glyphicon-link"></span></a>')
        })

        me.mouseleave(function () {
            me.html(html)
        })
    })
})